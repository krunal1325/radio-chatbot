import { Pinecone } from "@pinecone-database/pinecone";
import { format } from "date-fns";
import dotenv from "dotenv";
import { generateRandomString } from "./commonFunction.js";
import { getTranscriptText } from "./assemblyAI.helper.js";
import { embedText } from "./embedding.helper.js";

dotenv.config();

export const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });

const pineconeIndexName = process.env.PINECONE_INDEX_NAME;

export const pineconeIndex = pc.index(pineconeIndexName);

export const storeInPinecone = async ({
  transcriptionId,
  start_time,
  end_time,
  channelName,
}) => {
  try {
    console.log(
      "Storing vector in Pinecone...",
      channelName,
      start_time,
      end_time
    );
    const txtContent = await getTranscriptText(transcriptionId);
    const embedding = await embedText(txtContent);
    const id = generateRandomString();
    await pineconeIndex.upsert([
      {
        id,
        values: embedding,
        metadata: {
          source: txtContent,
          date: format(new Date(), "yyyy-MM-dd"),
          start_time: new Date(start_time).getTime(),
          end_time: new Date(end_time).getTime(),
          channel_name: channelName,
        },
      },
    ]);
    console.log(`Vector stored with ID: ${id}`);
  } catch (error) {
    console.error("Error storing vector in Pinecone:", error.message);
  }
};

// Function to search Pinecone for similar results
export const pineconeQuery = async ({ embedding, channel_name, minutes }) => {
  const currentTime = new Date();
  const minutesAgo = new Date(currentTime - minutes * 60 * 1000).getTime();
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
        channel_name: channel_name,
      },
    });

    console.log("Search result:", searchResult.matches.length);
    return searchResult.matches;
  } catch (error) {
    console.error("Error querying Pinecone:", error.message);
    throw error;
  }
};
