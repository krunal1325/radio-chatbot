import { Pinecone } from "@pinecone-database/pinecone";
import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";
import axios from "axios";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import path, { resolve as _resolve } from "path";
import https from "https";
import { fileURLToPath } from "url";
import fs from "fs";

dotenv.config();

// Initialize Pinecone client
const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
const genAI = new GoogleGenerativeAI(process.env.API_KEY);
const model2 = genAI.getGenerativeModel({ model: "text-embedding-004" });

// Create __dirname equivalent in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename, "utf-8");

const chunkDuration = 60 * 1000; // 1 minute
let chunkIndex = 1; // Start at 1, but we will read this from a file later
let fileStream = null;
let isStreaming = false;

const getChunkIndex = () => {
  const indexFilePath = path.join(__dirname, "files", "chunkIndex.json");
  if (existsSync(indexFilePath)) {
    const indexData = JSON.parse(readFileSync(indexFilePath));
    return indexData.index;
  }
  return 1; // Default starting value if the file doesn't exist
};

const setChunkIndex = (index) => {
  const indexFilePath = path.join(__dirname, "files", "chunkIndex.json");
  writeFileSync(indexFilePath, JSON.stringify({ index }, null, 2));
};

chunkIndex = getChunkIndex(); // Read the current chunk index

// Ensure today's folder exists
const getTodayFolderPath = () => {
  const today = new Date();
  const folderName = `${today.getFullYear()}-${
    today.getMonth() + 1
  }-${today.getDate()}`;
  const folderPath = path.join(__dirname, "files", folderName);
  if (!existsSync(folderPath)) {
    mkdirSync(folderPath, { recursive: true });
  }
  return folderPath;
};

const embedText = async (text, filePath) => {
  try {
    const result = await model2.embedContent(text);
    const vectorFilePath = filePath.replace(".mp3", ".json");
    const resultJson = JSON.stringify(result, null, 2);
    writeFileSync(vectorFilePath, resultJson);
    console.info(`Embedding saved to ${vectorFilePath}`);
    return result.embedding;
  } catch (error) {
    console.error("Error generating embeddings:", error.message);
    throw error;
  }
};

const storeInPinecone = async (id, embedding) => {
  try {
    const index = pc.index("radio-db");
    await index.upsert([
      {
        id: id,
        values: embedding,
        metadata: { source: "live-radio" },
      },
    ]);
    console.log(`Vector stored with ID: ${id}`);
  } catch (error) {
    console.error("Error storing vector in Pinecone:", error.message);
  }
};

const startNewChunk = () => {
  const todayFolderPath = getTodayFolderPath();
  const newChunkPath = path.join(
    todayFolderPath,
    `live-stream-${chunkIndex}.mp3`
  );

  if (fileStream) {
    fileStream.end(() => {
      console.log(`Completed chunk: live-stream-${chunkIndex - 1}.mp3`);
      const completedChunkPath = path.join(
        todayFolderPath,
        `live-stream-${chunkIndex - 1}.mp3`
      );
      transcribeAudio(completedChunkPath).catch((err) =>
        console.error(`Error transcribing ${completedChunkPath}:`, err.message)
      );
      fileStream = fs.createWriteStream(newChunkPath);
      chunkIndex++;
      setChunkIndex(chunkIndex); // Save the updated chunk index
      console.log(`Started new chunk: ${path.basename(newChunkPath)}`);
    });
  } else {
    fileStream = fs.createWriteStream(newChunkPath);
    console.log(`Started first chunk: ${path.basename(newChunkPath)}`);
  }
};

const streamUrl = "https://23153.live.streamtheworld.com/3AW.mp3";

https
  .get(streamUrl, (response) => {
    console.log("Connected to the live stream.");
    isStreaming = true;
    startNewChunk();

    response.on("data", (chunk) => {
      if (!isStreaming) return;
      fileStream.write(chunk);
    });

    response.on("end", () => {
      console.log("Live stream ended.");
      isStreaming = false;
      if (fileStream) fileStream.end();

      const lastChunkPath = path.join(
        getTodayFolderPath(),
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

    setInterval(() => {
      if (isStreaming) {
        startNewChunk();
      }
    }, chunkDuration);
  })
  .on("error", (error) => {
    console.error("Error connecting to the stream:", error.message);
  });

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

// Assembly AI Transcription Functions
const uploadAudio = async (filePath) => {
  try {
    const file = readFileSync(filePath);
    const response = await axios.post(
      "https://api.assemblyai.com/v2/upload",
      file,
      {
        headers: {
          authorization: process.env.ASSEMBLY_AI_KEY,
          "content-type": "application/octet-stream",
        },
      }
    );
    return response.data.upload_url;
  } catch (error) {
    console.error("Error uploading audio file:", error.message);
    throw error;
  }
};

// Function to save transcription files
const saveTranscriptionFiles = async (transcriptionResult, chunkIndex) => {
  const todayFolder = getTodayFolderPath();
  const transcriptionFileName = `transcription-${chunkIndex}.json`;
  const transcriptionFilePath = path.join(todayFolder, transcriptionFileName);

  console.log("Grouping transcription by speaker...");
  const speakerTranscription = groupBySpeaker(transcriptionResult);
  console.log("Transcription grouped by speaker.", speakerTranscription);

  // Save JSON transcription
  console.log(`Saving transcription to ${transcriptionFilePath}`);
  writeFileSync(
    transcriptionFilePath,
    JSON.stringify(speakerTranscription, null, 2)
  );
  console.log("Transcription JSON saved.");

  // Save transcription as TXT
  const transcriptionTxtFilePath = transcriptionFilePath.replace(
    ".json",
    ".txt"
  );

  console.log("Converting transcription to TXT...");

  const txtContent = transcriptionResult.utterances
    .map((utterance) => {
      return `Speaker ${utterance.speaker}: ${utterance.text}`;
    })
    .join("\n");

  console.log(`Saving transcription as TXT to ${transcriptionTxtFilePath}`);
  writeFileSync(transcriptionTxtFilePath, txtContent);

  // Generate and store embeddings
  console.log("Generating embeddings...");
  const embeddingFilePath = transcriptionFilePath.replace(".json", ".jsonl");
  const embedding = await embedText(txtContent, embeddingFilePath);
  const uniqueId = `transcription-${chunkIndex}`;
  await storeInPinecone(uniqueId, embedding.values);

  console.log("Transcription TXT saved.");
};

// Poll transcription status until it is completed or failed
const pollTranscriptionStatus = async (transcriptionId, chunkIndex) => {
  while (true) {
    const transcriptionResult = await getTranscriptionStatus(transcriptionId);
    const status = transcriptionResult.status;

    if (status === "completed") {
      console.log(`Transcription completed for chunk ${chunkIndex}.`);
      return transcriptionResult;
    } else if (status === "failed") {
      console.error(
        `Transcription failed for chunk ${chunkIndex}: ${transcriptionResult.error}`
      );
      return null;
    } else {
      console.log(
        `Transcription for chunk ${chunkIndex} is still processing...`
      );
      await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait before checking again
    }
  }
};

// Transcribe audio function
const transcribeAudio = async (filePath) => {
  if (!filePath || !fs.existsSync(filePath)) {
    console.error(`File ${filePath} is missing or not fully written yet.`);
    return;
  }

  const chunkIndex = path.basename(filePath, ".mp3").split("-")[2];

  try {
    const uploadUrl = await uploadAudio(filePath);
    const response = await axios.post(
      "https://api.assemblyai.com/v2/transcript",
      { audio_url: uploadUrl, speaker_labels: true },
      { headers: { authorization: process.env.ASSEMBLY_AI_KEY } }
    );
    const transcriptionId = response.data.id;

    // Poll the transcription status
    const transcriptionResult = await pollTranscriptionStatus(
      transcriptionId,
      chunkIndex
    );

    if (transcriptionResult) {
      saveTranscriptionFiles(transcriptionResult, chunkIndex);
    }
  } catch (error) {
    console.error("Error transcribing the audio file:", error.message);
  }
};

const getTranscriptionStatus = async (transcriptionId) => {
  try {
    const response = await axios.get(
      `https://api.assemblyai.com/v2/transcript/${transcriptionId}`,
      { headers: { authorization: process.env.ASSEMBLY_AI_KEY } }
    );
    return response.data;
  } catch (error) {
    console.error("Error fetching transcription status:", error.message);
    throw error;
  }
};

function groupBySpeaker(transcriptionData) {
  const speakerSegments = [];
  let currentSpeaker = null;
  let currentSegment = "";

  transcriptionData.words.forEach((word) => {
    if (word.speaker !== currentSpeaker) {
      if (currentSegment) {
        speakerSegments.push({
          speaker: currentSpeaker,
          text: currentSegment.trim(),
        });
      }
      currentSpeaker = word.speaker;
      currentSegment = word.text + " ";
    } else {
      currentSegment += word.text + " ";
    }
  });

  // Add the last segment
  if (currentSegment) {
    speakerSegments.push({
      speaker: currentSpeaker,
      text: currentSegment.trim(),
    });
  }

  return speakerSegments;
}
