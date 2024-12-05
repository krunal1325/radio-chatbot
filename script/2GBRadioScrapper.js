// Import dependencies
import dotenv from "dotenv";
import axios from "axios";
import https from "https";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  uploadAudio,
  submitForTranscription,
  pollTranscriptionStatus,
} from "../helper/assemblyAI.helper.js";
import { storeInPinecone } from "../helper/pinecone.helper.js";
import { ChannelNames } from "../helper/constant.helper.js";

dotenv.config();

// Constants
const CHUNK_DURATION_MS = 60 * 1000; // 1 minute
const STREAM_CHECK_INTERVAL_MS = 10 * 1000; // 10 seconds
const FILES_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "files"
);

// State variables
let currentChunkStartTime = null;
let fileStream = null;
let isStreaming = false;
let streamPingInterval = null;
let chunkIndex = 0;
let radioName = "";
let streamUrl = "";

/** Transcription **/
const transcribeAudio = async ({ filePath, startTime, endTime }) => {
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    return;
  }
  try {
    console.log("Uploading audio...");
    const uploadUrl = await uploadAudio(filePath);
    const { id: transcriptionId } = await submitForTranscription(uploadUrl);
    const transcriptionResult = await pollTranscriptionStatus(transcriptionId);
    if (transcriptionResult) {
      await storeInPinecone({
        transcriptionId,
        channelName: radioName,
        end_time: endTime,
        start_time: startTime,
      });
      console.log(`Transcription completed for ${path.basename(filePath)}`);
    }
  } catch (error) {
    console.error(`Error transcribing ${filePath}:`, error.message);
  }
};

/** Chunk Management **/
const startNewChunk = () => {
  const chunkFileName = `${radioName}-${chunkIndex}.mp3`;
  const chunkFilePath = path.join(FILES_DIR, chunkFileName);

  if (fileStream) {
    fileStream.end(async () => {
      console.log(`Completed chunk: ${chunkFileName}`);
      transcribeAudio({
        filePath: chunkFilePath,
        startTime: currentChunkStartTime,
        endTime: new Date(),
        radioName,
      });
      initNewChunk({ radioName });
    });
  } else {
    initNewChunk({ radioName });
  }
};

const initNewChunk = () => {
  const newChunk = chunkIndex + 1;
  chunkIndex = newChunk;
  const chunkFileName = `${radioName}-${newChunk}.mp3`;
  const chunkFilePath = path.join(FILES_DIR, chunkFileName);
  fileStream = fs.createWriteStream(chunkFilePath);
  currentChunkStartTime = new Date();
  console.log(`Started new chunk: ${path.basename(chunkFilePath)}`);
};

/** Stream Handling **/
const connectToStream = ({ channelName, channelUrl }) => {
  radioName = channelName;
  streamUrl = channelUrl;
  https
    .get(streamUrl, (response) => {
      console.log("Connected to live stream.");
      isStreaming = true;
      startNewChunk({ radioName });

      response.on("data", (chunk) => {
        if (isStreaming && fileStream) fileStream.write(chunk);
      });

      response.on("end", handleStreamEnd.bind(null, { radioName }));
      response.on("error", handleStreamError);

      setInterval(
        () => isStreaming && startNewChunk({ radioName }),
        CHUNK_DURATION_MS
      );
    })
    .on("error", handleStreamError);
};

const handleStreamEnd = () => {
  console.log("Live stream ended.");
  isStreaming = false;
  if (fileStream) fileStream.end();

  console.log("Starting stream availability check...");
  streamPingInterval = setInterval(
    () => pingStream({ streamUrl }),
    STREAM_CHECK_INTERVAL_MS
  );
};

const handleStreamError = (error) => {
  console.error("Stream error:", error.message);
  if (fileStream) fileStream.end();
};

const pingStream = async () => {
  try {
    const response = await axios.head(streamUrl, { timeout: 5000 });
    if (response.status === 200) {
      console.log("Stream is back. Reconnecting...");
      clearInterval(streamPingInterval);
      connectToStream({ streamUrl });
    }
  } catch (error) {
    console.error("Stream unavailable:", error.message);
  }
};

/** Initialization **/
export const startRadioStream = (
  radioName = ChannelNames["2GB"],
  streamUrl = "https://23163.live.streamtheworld.com/2GB.mp3"
) => connectToStream({ channelName: radioName, channelUrl: streamUrl });

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
