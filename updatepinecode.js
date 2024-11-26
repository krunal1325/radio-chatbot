import dotenv from "dotenv";
import { Pinecone } from "@pinecone-database/pinecone";

dotenv.config();

// Initialize Pinecone client
const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
const pineconeIndex = pc.index("radio-db");

// Helper function to convert "HH:mm:ss" to seconds
function timeToSeconds(timeString) {
  const [hours, minutes, seconds] = timeString.split(":").map(Number);
  return hours * 3600 + minutes * 60 + seconds;
}

// Function to fetch all items and update metadata
const updateMetadata = async (paginationToken) => {
  try {
    // Fetch all data (Paginate if necessary)
    const data = await pineconeIndex.listPaginated({
      limit: 10,
      paginationToken,
    });
    const ids = data.vectors.map((item) => item.id);
    const idData = await pineconeIndex.fetch(ids);
    for (const id of ids) {
      const record = idData.records[id];
      if (record) {
        await pineconeIndex.update({
          id,
          metadata: {
            start_time: new Date(
              `${record.metadata.date} ${record.metadata.start_time}`
            ).getTime(),
            end_time: new Date(
              `${record.metadata.date} ${record.metadata.end_time}`
            ).getTime(),
          },
        });
      }
    }
    if (data?.pagination?.next) {
      await updateMetadata(data.pagination.next);
    }

    console.log("Metadata update completed!");
  } catch (error) {
    console.error("Error updating metadata:", error.message);
  }
};

updateMetadata();

// const deleteIndex = async (paginationToken) => {
//   // delete all the indexes whose don't have the start_time meta data
//   const data = await pineconeIndex.listPaginated({
//     limit: 100,
//     paginationToken,
//   });
//   const ids = data.vectors.map((item) => item.id);
//   const idData = await pineconeIndex.fetch(ids);
//   const idsToDelete = Object.values(idData.records)
//     .filter((item) => !item.metadata.radio_name)
//     .map((item) => item.id);
//   if (idsToDelete.length > 0) {
//     await pineconeIndex.deleteMany(idsToDelete);
//   }
//   if (data?.pagination?.next) {
//     await deleteIndex(data.pagination.next);
//   }
// };

// deleteIndex();
