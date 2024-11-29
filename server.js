import express from "express";
import dotenv from "dotenv";
import { deleteOldPineconeIndexCronjob } from "./cron/deleteCron.js";
import { searchCronjob } from "./cron/searchCron.js";
import { startTVStream } from "./script/tvScrapper.js";
import { startRadioStream } from "./script/radioScrapper.js";
dotenv.config();

const PORT = process.env.PORT || 3000;

// Create an Express server
const app = express();
app.use(express.json()); // Middleware to parse JSON body

// Start the server

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  searchCronjob.start();
  deleteOldPineconeIndexCronjob.start();
  startRadioStream({
    radioName: "3AW",
    streamUrl: "https://23153.live.streamtheworld.com/3AW.mp3",
  });
  startTVStream({
    youtubeUrl: "https://youtu.be/vOTiJkg1voo",
  });
});
