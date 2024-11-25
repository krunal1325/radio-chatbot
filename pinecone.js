import express from "express";
import dotenv from "dotenv";
import { Pinecone } from "@pinecone-database/pinecone";
import { GoogleGenerativeAI } from "@google/generative-ai";
import axios from "axios";

dotenv.config();

// Initialize Pinecone client
const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
const genAI = new GoogleGenerativeAI(process.env.API_KEY);
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
      Here's some related information from our database:
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
            - Respond only based on the provided data.
            - Exclude individuals with no relevant information.
            - Summarize relevant information concisely using bullet points.
            - If no relevant data exists for all individuals, respond with "No relevant information found."
            - Maintain accuracy and avoid fabricating information.
            - Use clear and professional language.
          `,
        },
      },
    });

    return response;
  } catch (error) {
    console.log(error);
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
  try {
    const searchResult = await pineconeIndex.query({
      vector: embedding,
      topK: 10, // Get the top 10 results
      includeMetadata: true,
      filter: {
        date: {
          $eq: new Date().toLocaleDateString(),
        },
      },
    });

    console.log("Search result:", searchResult.matches);
    return searchResult.matches;
  } catch (error) {
    console.error("Error querying Pinecone:", error.message);
    throw error;
  }
};

// API endpoint to handle query
app.post("/search", async (req, res) => {
  // const { query } = req.body;
  // if (!query) {
  //   return res.status(400).json({ error: "Query text is required." });
  // }
  const query = `
      Please analyze the data to monitor the following individuals in order of priority:
      
      1. Prime Minister: Anthony Albanese (Labor Party; ALP)
      2. Treasurer: Jim Chalmers (Labor Party; ALP)
      3. Opposition Leader (or Leader of the Opposition, Liberal Party Leader, Shadow Leader): Peter Dutton (Liberal Party; coalition)
      4. Deputy Leader of the Opposition: Sussan Ley (Liberal Party; coalition)
      5. Leader: Adam Bandt (Australian Greens; The Greens)
      6. Leader: David Littleproud (The Nationals; The Nats; coalition)
      
      For each individual:
      - If relevant data is found, summarize recent activities, statements, or actions mentioned in the data, along with any relevant policies or positions.
      - If no data is available for an individual, **do not include them in the response**. Only state "No relevant information found" if no relevant data exists for any of the individuals.
      
      Ensure:
      - Responses for individuals with data are concise and well-structured in bullet points.
      - Do not fabricate or assume any details beyond the provided data.
    `;

  try {
    console.log("Generating embeddings for the query...");
    const embedding = await embedQuery(query);
    console.log("Searching Pinecone for similar results...");
    const results = await searchPinecone(embedding.values);

    console.log("Results retrieved, formatting response...");

    const combinedMetadata = results
      .map((result) => result.metadata.source)
      .join(" ");

    console.log("Sending prompt to Gemini...");

    const geminiResponse = await getGeminiResponse(combinedMetadata, query);

    console.log("Returning the response...");
    return res.status(200).json({
      response: geminiResponse.response.candidates[0].content.parts[0].text,
    });
  } catch (error) {
    console.log(error);
    console.error("Error processing the query:", error.message);
    return res.status(500).json({ error: "Internal server error." });
  }
});

// Start the server
const PORT = 3005;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
