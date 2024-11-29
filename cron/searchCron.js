import { CronJob } from "cron";
import { embedText } from "../helper/embedding.helper.js";
import { geminiQuery } from "../helper/geminiQuery.helper.js";
import { pineconeQuery } from "../helper/pinecone.helper.js";

const TIME_FOR_SEARCH_QUERY = Number(process.env.TIME_FOR_SEARCH_QUERY) || 10;

const search = async (channel_name) => {
  try {
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
    console.log("Generating embeddings for the query...");
    const embedding = await embedText(query);
    console.log("Searching Pinecone for similar results...");
    const results = await pineconeQuery({
      embedding,
      channel_name,
      minutes: TIME_FOR_SEARCH_QUERY,
    });

    console.log("Results retrieved, formatting response...");

    const combinedMetadata = results
      .map((result) => result.metadata?.source || "")
      .join(" ");

    console.log("Sending prompt to Gemini...");

    const geminiResponse = await geminiQuery({ query, data: combinedMetadata });

    if (!geminiResponse) {
      console.log("No relevant information found, skipping SMS.");
      return null; // Return null if no data is available to avoid sending SMS
    }

    console.log("Gemini response generated.");
    return geminiResponse;
  } catch (error) {
    console.error("Error executing cron job:", error.message);
  }
};

// Cron job logic for scheduled search
export const searchCronjob = new CronJob(
  `*/${TIME_FOR_SEARCH_QUERY} * * * *`, // cronTime every 20 minutes
  async function () {
    try {
      console.log("Executing scheduled search...");
      const response = await search("3AW");
      const response2 = await search("abc-news");
      if (response) {
        sendSMS("+917405709622", `\n${response}`);
      }
      if (response2) {
        sendSMS("+917405709622", `\n${response2}`);
      }
      console.log("Search response:", response);
    } catch (error) {
      console.error("Cron job error:", error.message);
    }
  }
);
