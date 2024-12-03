import puppeteer from "puppeteer";
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import {
  pollTranscriptionStatus,
  submitForTranscription,
  uploadAudio,
} from "../helper/assemblyAI.helper.js";
import { storeInPinecone } from "../helper/pinecone.helper.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename, "utf-8");

const AUDIO_PREFIX = "abc-news"; // Constant variable for the prefix
const FILE_PATH = ["..", "tvFiles", AUDIO_PREFIX];

let ffmpegProcess = null;

// Function to launch YouTube video with Puppeteer
const playYouTubeVideo = async (videoUrl) => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--autoplay-policy=no-user-gesture-required", "--disable-infobars"],
  });

  const page = await browser.newPage();

  try {
    await page.goto(videoUrl, { waitUntil: "domcontentloaded" });
    console.log("YouTube page loaded.");

    await page.waitForSelector(".html5-video-player");
    console.log("Video is playing.");

    await page.evaluate(() => {
      const video = document.querySelector("video");
      if (video) {
        video.muted = false;
        video.play();
      }
    });
  } catch (error) {
    console.error("Error playing YouTube video:", error.message);
  }

  // Start FFmpeg to capture audio in chunks
  ffmpegProcess = startFFmpegRecording();
};

// Function to start FFmpeg to capture audio and split into 1-minute chunks
const startFFmpegRecording = () => {
  const ffmpegPath = "C:/ProgramData/chocolatey/bin/ffmpeg.exe";

  const outputFolder = path.join(__dirname, ...FILE_PATH);

  if (!fs.existsSync(outputFolder)) {
    fs.mkdirSync(outputFolder, { recursive: true });
  }

  const audioFilePath = path.join(outputFolder, `${AUDIO_PREFIX}-%d.mp3`);

  // Spawn the FFmpeg process
  const ffmpegProcess = spawn(ffmpegPath, [
    "-f",
    "dshow",
    "-i",
    "audio=CABLE Output (VB-Audio Virtual Cable)",
    "-ac",
    "2",
    "-f",
    "segment", // Segment output to create chunks
    "-segment_time",
    "60", // Split into 1-minute chunks
    "-reset_timestamps",
    "1", // Reset timestamps for each segment
    "-y", // Overwrite files if they exist
    audioFilePath, // File name format with index
  ]);

  ffmpegProcess.stdout.on("data", (data) => {
    console.log(`FFmpeg Output: ${data}`);
  });

  ffmpegProcess.stderr.on("data", (data) => {
    const log = data.toString();
    // console.error(`FFmpeg Error: ${data}`);

    const match = log.match(/Opening '(.*)' for writing/);
    if (match) {
      const newFile = match[1];
      const currentTime = new Date().getTime();
      const start_time = currentTime - 60;
      const end_time = currentTime;
      // Call your custom function or logic here
      onChunkCreated({
        filePath: newFile,
        start_time,
        end_time,
      });
    }
  });

  ffmpegProcess.on("close", (code) => {
    console.log(`FFmpeg process exited with code ${code}`);
  });

  return ffmpegProcess;
};

const saveTranscriptionFiles = async (
  transcriptionResult,
  start_time,
  end_time
) => {
  const transcriptionId = transcriptionResult.id;
  await storeInPinecone({
    transcriptionId,
    start_time,
    end_time,
    channelName: AUDIO_PREFIX,
  });

  console.log("Transcription TXT saved.");
};

const onChunkCreated = async ({ filePath, start_time, end_time }) => {
  try {
    console.log(`Chunk started: ${path.basename(filePath)}`);
    const fileName = path.basename(filePath).replace(".mp3", "");
    const array = fileName.split("-");

    const chunkIndex = array[array.length - 1];
    const oldFilePath = path.join(
      __dirname,
      ...FILE_PATH,
      `${AUDIO_PREFIX}-${chunkIndex - 1}.mp3`
    );

    if (fs.existsSync(oldFilePath)) {
      console.log(`processing chunk: ${path.basename(oldFilePath)}`);
      const uploadURL = await uploadAudio(oldFilePath);
      console.log("Audio uploaded.");
      const transcription = await submitForTranscription(uploadURL);
      const transcriptionId = transcription.id;
      console.log("Transcription started.");
      const transcriptionResult = await pollTranscriptionStatus(
        transcriptionId
      );
      console.log("Transcription completed.");
      if (transcriptionResult) {
        await saveTranscriptionFiles(transcriptionResult, start_time, end_time);
      }
    }
  } catch (error) {
    console.error("Error processing chunk:", error.message);
    stopFFmpegRecording();
  }
};

const stopFFmpegRecording = () => {
  if (ffmpegProcess) {
    ffmpegProcess.kill("SIGINT"); // Send SIGINT to stop FFmpeg
  }
};

process.on("SIGINT", () => {
  console.log("Process interrupted. Closing files.");
  stopFFmpegRecording();
});

// Run the video and audio capture
export const startTVStream = (youtubeUrl = "https://youtu.be/vOTiJkg1voo") =>
  playYouTubeVideo(youtubeUrl);

// startTVStream();
