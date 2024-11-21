import { Pinecone } from "@pinecone-database/pinecone";
import dotenv from "dotenv";
dotenv.config();
import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from "fs";
import path from "path";
import https from "https";
import mime from "mime-types";
import { fileURLToPath } from "url";

// Create __dirname equivalent in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_KEY = process.env.API_KEY; // Add your API key in the .env file
const genAI = new GoogleGenerativeAI(API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });
const model2 = genAI.getGenerativeModel({ model: "text-embedding-004" });
// Initialize Pinecone client
// const pinecone = new PineconeClient();
const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });

const embedText = async (text, filePath) => {
  try {
    // Generate embeddings using Google Gemini
    const result = await model2.embedContent(text);

    // Embedding returned as an array
    // console.log("embedded text",result);

    const vectorFilePath = filePath.replace(".mp3", ".json");

    // Convert the embedding result to a JSON string
    const resultJson = JSON.stringify(result, null, 2); // Pretty print with 2 spaces

    // Write the JSON string to the file
    fs.writeFileSync(vectorFilePath, resultJson);
    console.info(`Embedding saved to ${vectorFilePath}`);
    return result.embedding;
  } catch (error) {
    console.error("Error generating embeddings:", error.message);
    throw error;
  }
};

const storeInPinecone = async (id, embedding) => {
  try {
    const index = pc.index("radio-db"); // Ensure this matches your index name

    // Upsert the vector with the ID and embedding
    await index.upsert([
      {
        id: id, // Unique ID for the transcription
        values: embedding, // Vector values
        metadata: { source: "live-radio" }, // Add metadata if needed
      },
    ]);

    console.log(`Vector stored with ID: ${id}`);
  } catch (error) {
    console.error("Error storing vector in Pinecone:", error.message);
  }
};

// Stream URL
const streamUrl = "https://23153.live.streamtheworld.com/3AW.mp3";

// Track the current chunk details
let chunkIndex = 1;
let currentChunkPath = null;
let fileStream = null;
let isStreaming = false;
const chunkDuration = 60000; // 1 minute

const startNewChunk = () => {
  const newChunkPath = path.join(__dirname, `live-stream-${chunkIndex}.mp3`);

  if (fileStream) {
    // Finish writing the current chunk and ensure all data is flushed
    fileStream.end(() => {
      console.log(`Completed chunk: live-stream-${chunkIndex - 1}.mp3`);

      // Start transcription for the completed chunk
      const completedChunkPath = path.join(
        __dirname,
        `live-stream-${chunkIndex - 1}.mp3`
      );
      transcribeAudio(completedChunkPath).catch((err) =>
        console.error(`Error transcribing ${completedChunkPath}:`, err.message)
      );

      // Start a new chunk
      fileStream = fs.createWriteStream(newChunkPath);
      chunkIndex++;
      console.log(`Started new chunk: ${path.basename(newChunkPath)}`);
    });
  } else {
    // First chunk setup
    fileStream = fs.createWriteStream(newChunkPath);
    console.log(`Started first chunk: ${path.basename(newChunkPath)}`);
  }
};

// Request the live stream
https
  .get(streamUrl, (response) => {
    console.log("Connected to the live stream.");
    isStreaming = true;

    // Initialize the first chunk
    startNewChunk();

    response.on("data", (chunk) => {
      if (!isStreaming) return;
      fileStream.write(chunk);
    });

    response.on("end", () => {
      console.log("Live stream ended.");
      isStreaming = false;
      if (fileStream) fileStream.end();

      // Transcribe the last chunk
      const lastChunkPath = path.join(
        __dirname,
        `live-stream-${chunkIndex - 1}.mp3`
      );
      transcribeAudio(lastChunkPath).catch((err) =>
        console.error(
          `Error transcribing last chunk ${lastChunkPath}:`,
          err.message
        )
      );
    });

    response.on("error", (error) => {
      console.error("Error in the response:", error.message);
      if (fileStream) fileStream.end();
    });

    // Rotate chunks every minute
    setInterval(() => {
      if (isStreaming) {
        startNewChunk();
      }
    }, chunkDuration);
  })
  .on("error", (error) => {
    console.error("Error connecting to the stream:", error.message);
  });

// Handle process termination gracefully
process.on("SIGINT", () => {
  console.log("Process interrupted. Closing files.");
  isStreaming = false;
  if (fileStream) {
    fileStream.end(() => {
      console.log("File closed.");
      process.exit();
    });
  }
});

const transcribeAudio = async (filePath) => {
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
};
