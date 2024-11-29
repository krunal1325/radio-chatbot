import { CronJob } from "cron";
// import { pineconeIndex } from "../helper/pinecone.helper.js";

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
export const deleteOldPineconeIndexCronjob = new CronJob(
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
