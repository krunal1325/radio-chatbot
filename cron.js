import express from "express";
import dotenv from "dotenv";
import { Pinecone } from "@pinecone-database/pinecone";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { format } from "date-fns";
import { CronJob } from "cron";
import { sendSMS } from "./helper/twilio.helper.js";

dotenv.config();

const TIME_FOR_SEARCH_QUERY = 10;

// Initialize Pinecone client
const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY2);
const model2 = genAI.getGenerativeModel({ model: "text-embedding-004" });
const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

// Create an Express server
const app = express();
app.use(express.json()); // Middleware to parse JSON body

const pineconeIndex = pc.index("radio-db");

const getGeminiResponse = async (data, query) => {
  try {
    const prompt = `
      The user asked: "${query}".
      Here is the related information retrieved from our database:
      ${data}.
    `;

    const response = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: {
            text: prompt,
          },
        },
      ],
      systemInstruction: {
        role: "system",
        parts: {
          text: `
            Instructions for the response:
            - Respond **only** based on the provided database information.
            - For each individual mentioned, summarize their recent activities, statements, or actions, and include relevant policies or positions.
            - Specify if they have been live or recently active on any media platforms.
            - Use bullet points for clarity.
            - Exclude individuals who do not have relevant data. Do not mention them in the response.
            - If no relevant data exists for **any** of the individuals, return null.
            - Ensure the response is concise, professional, and accurately reflects the provided data.
            - Avoid assumptions or fabrication of information.
          `,
        },
      },
    });

    // Check if the AI response indicates no relevant information
    const responseText =
      response.response.candidates[0]?.content?.parts[0]?.text;

    console.log("Gemini response:", responseText);
    if (
      responseText?.trim() === "No relevant information found." ||
      responseText?.trim() === "null"
    ) {
      return null; // Explicitly return null to indicate no data
    }

    return responseText;
  } catch (error) {
    console.error("Error calling Gemini:", error.message);
    throw new Error("Failed to fetch response from Gemini.");
  }
};

// Function to generate embeddings for a query
const embedQuery = async (query) => {
  try {
    const result = await model2.embedContent(query);
    return result.embedding;
  } catch (error) {
    console.error("Error generating embeddings for query:", error.message);
    throw error;
  }
};

// Function to search Pinecone for similar results
const searchPinecone = async (embedding) => {
  const currentTime = new Date();
  const minutesAgo = new Date(
    currentTime - TIME_FOR_SEARCH_QUERY * 60 * 1000
  ).getTime();
  try {
    const searchResult = await pineconeIndex.query({
      vector: embedding,
      topK: 10, // Get the top 10 results
      includeMetadata: true,
      filter: {
        start_time: {
          $gte: minutesAgo,
        },
        date: {
          $eq: format(new Date(), "yyyy-MM-dd"),
        },
      },
    });

    console.log("Search result:", searchResult.matches.length);
    return searchResult.matches;
  } catch (error) {
    console.error("Error querying Pinecone:", error.message);
    throw error;
  }
};

// Search function to be called by cron job or API
const search = async () => {
  const query = `
    Please analyze the data and provide recent information about the following individuals:
    
    1. Prime Minister: Anthony Albanese (Labor Party; ALP)
    2. Treasurer: Jim Chalmers (Labor Party; ALP)
    3. Opposition Leader (Liberal Party Leader, Shadow Leader): Peter Dutton (Liberal Party; coalition)
    4. Deputy Leader of the Opposition: Sussan Ley (Liberal Party; coalition)
    5. Leader: Adam Bandt (Australian Greens; The Greens)
    6. Leader: David Littleproud (The Nationals; The Nats; coalition)
    
    For each individual:
    - Summarize their recent activities, statements, or actions.
    - Include details on any relevant policies or positions they have taken.
    - Specify if they have been live or recently active on any media platforms.
    
    Additional Notes:
    - Use bullet points for clarity.
    - Only include individuals for whom relevant information exists. Exclude others.
    - If no relevant data exists for all individuals, return null.
    - Ensure the information is clear, concise, and strictly based on the provided data.
  `;

  try {
    console.log("Generating embeddings for the query...");
    const embedding = await embedQuery(query);
    console.log("Searching Pinecone for similar results...");
    const results = await searchPinecone(embedding.values);

    console.log("Results retrieved, formatting response...");

    const combinedMetadata = results
      .map((result) => result.metadata?.source || "")
      .join(" ");

    console.log("Sending prompt to Gemini...");

    const geminiResponse = await getGeminiResponse(combinedMetadata, query);

    if (!geminiResponse) {
      console.log("No relevant information found, skipping SMS.");
      return null; // Return null if no data is available to avoid sending SMS
    }
    sendSMS("+917405709622", `\n${geminiResponse}`);
    console.log("Gemini response generated.");
    return geminiResponse;
  } catch (error) {
    console.error("Error processing the query:", error.message);
    throw error;
  }
};

// Cron job logic for scheduled search
const searchCronjob = new CronJob(
  `*/${TIME_FOR_SEARCH_QUERY} * * * *`, // cronTime every 20 minutes
  async function () {
    try {
      console.log("Executing scheduled search...");
      const response = await search();
      console.log("Search response:", response);
    } catch (error) {
      console.error("Cron job error:", error.message);
    }
  },
  null, // onComplete
  true, // start
  "UTC" // timeZone
);

const deleteOldPineconeIndex = async (paginationToken) => {
  try {
    const twoDaysAgo = subDays(new Date(), 2).getTime(); // Get timestamp for 2 days ago

    // List all vectors with pagination
    const data = await pineconeIndex.listPaginated({
      limit: 100,
      paginationToken,
    });

    const ids = data.vectors.map((item) => item.id);

    // Fetch metadata for the listed vector IDs
    const idData = await pineconeIndex.fetch(ids);

    // Filter vectors based on the `start_time` metadata
    const idsToDelete = Object.values(idData.records)
      .filter((item) => {
        const startTime = item.metadata?.start_time;
        return startTime && new Date(startTime).getTime() < twoDaysAgo;
      })
      .map((item) => item.id);

    // Delete vectors that match the criteria
    if (idsToDelete.length > 0) {
      console.log(`Deleting ${idsToDelete.length} old vectors.`);
      await pineconeIndex.deleteMany(idsToDelete);
    }

    // Continue pagination if there's more data
    if (data?.pagination?.next) {
      await deleteOldPineconeIndex(data.pagination.next);
    }
  } catch (error) {
    console.error("Error deleting old Pinecone index:", error.message);
  }
};

// Delete old Pinecone index CRON JOB has to run every 24 hours
const deleteOldPineconeIndexCronjob = new CronJob(
  "0 0 0 * * *", // cronTime every day at midnight
  async function () {
    try {
      console.log("Deleting old Pinecone index...");
      await deleteOldPineconeIndex();
      console.log("Old Pinecone index deleted.");
    } catch (error) {
      console.error("Error deleting old Pinecone index:", error.message);
    }
  }
);

// Start the server
const PORT = 3006;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  searchCronjob.start();
  deleteOldPineconeIndexCronjob.start();
});
