import { Pinecone } from "@pinecone-database/pinecone";
import dotenv from "dotenv";

dotenv.config();

const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY,
});

const pineconeIndex = pinecone.Index(process.env.PINECONE_INDEX_NAME);

export const storeInPinecone = async (
  id,
  embedding,
  txtContent,
  start_time,
  end_time,
  radioName
) => {
  try {
    await pineconeIndex.upsert([
      {
        id: id,
        values: embedding,
        metadata: {
          source: txtContent,
          date: format(new Date(), "yyyy-MM-dd"),
          start_time: new Date(start_time).getTime(),
          end_time: new Date(end_time).getTime(),
          radio_name: radioName,
        },
      },
    ]);
    console.log(`Vector stored with ID: ${id}`);
  } catch (error) {
    console.error("Error storing vector in Pinecone:", error.message);
  }
};
