import { CronJob } from "cron";
import { embedText } from "../helper/embedding.helper.js";
import { geminiQuery } from "../helper/geminiQuery.helper.js";
import { pineconeQuery } from "../helper/pinecone.helper.js";
import dotenv from "dotenv";
import { sendSMS } from "../helper/twilio.helper.js";

dotenv.config();

const TIME_FOR_SEARCH_QUERY = Number(process.env.TIME_FOR_SEARCH_QUERY) || 10;

export const search = async (channel_name, queryBody = "") => {
  try {
    const query = queryBody || "current topics?";
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

    const geminiResponse = await geminiQuery({ data: combinedMetadata });

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
