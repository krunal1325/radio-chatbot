import express from "express";
import dotenv from "dotenv";
import { deleteOldPineconeIndexCronjob } from "./cron/deleteCron.js";
import { search, searchCronjob } from "./cron/searchCron.js";
dotenv.config();

const PORT = process.env.PORT || 3000;

// Create an Express server
const app = express();
app.use(express.json()); // Middleware to parse JSON body

// Start the server
app.post("/search", async (req, res) => {
  const { channel_name, query } = req.body;
  const response = await search(channel_name, query);
  res.json(response);
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  searchCronjob.start();
  deleteOldPineconeIndexCronjob.start();
});
