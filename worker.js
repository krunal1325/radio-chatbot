import { Worker } from "bullmq";
import dotenv from "dotenv";
import { embedText, storeInPinecone } from "./index.js";
dotenv.config();
import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from "fs";
import path from "path";
import mime from "mime-types";

const API_KEY = process.env.API_KEY; // Add your API key in the .env file
const genAI = new GoogleGenerativeAI(API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });

const worker = new Worker(
  "transcribe",
  async (job) => {
    const filePath = job.data?.filePath;

    if (!filePath || !fs.existsSync(filePath)) {
      console.error(`File ${filePath} is missing or not fully written yet.`);
      return;
    }

    try {
      const file = fs.readFileSync(filePath);
      const audio = {
        inlineData: {
          data: Buffer.from(file).toString("base64"),
          mimeType: mime.lookup(filePath),
        },
      };
      const prompt = "Extract text from this audio.";

      console.log(`Transcribing ${path.basename(filePath)}...`);
      const result = await model.generateContent([audio, prompt]);
      const transcription = result.response.text();

      // Save transcription to a text file
      const textFilePath = filePath.replace(".mp3", ".txt");
      fs.writeFileSync(textFilePath, transcription);
      console.info(`Transcription saved to ${textFilePath}`);

      // Generate and store embeddings
      const embedding = await embedText(transcription, filePath);
      const uniqueId = path.basename(filePath).replace(".mp3", "");
      await storeInPinecone(uniqueId, embedding.values);
    } catch (error) {
      console.error(`Error transcribing ${filePath}:`, error.message);
    }
  },
  {
    concurrency: 1,
    connection: {
      host: process.env.REDIS_HOST,
      port: Number(process.env.REDIS_PORT),
    },
  }
);

worker.on("completed", (job) => {
  console.log(job.data);
});

worker.on("failed", (job) => {
  console.log(job?.data);
});

worker.on("progress", (job) => {
  console.log(job.data);
});

export default worker;
