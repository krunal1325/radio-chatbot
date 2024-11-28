import { Pinecone } from "@pinecone-database/pinecone";

export const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });

export const pineconeIndexName = process.env.PINECONE_INDEX_NAME;

export const storeInPinecone = async ({
  id,
  embedding,
  txtContent,
  start_time,
  end_time,
  channelName,
}) => {
  try {
    const index = pc.index(pineconeIndexName);
    await index.upsert([
      {
        id: id,
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
