import puppeteer from "puppeteer";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import puppeteerExtra from "puppeteer-extra";
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
import { convertToMillisecond } from "../helper/common.helper.js";
import { ChannelNames } from "../helper/constant.helper.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename, "utf-8");

const AUDIO_PREFIX = ChannelNames.SKY_NEWS; // Constant variable for the prefix
const FILE_PATH = ["..", "tvFiles", AUDIO_PREFIX];

let ffmpegProcess = null;
let isError = false;
// Add stealth plugin to bypass detection
puppeteerExtra.use(StealthPlugin());

const timeout = convertToMillisecond(60);

const playVideoStream = async (url, email, password) => {
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-infobars",
      "--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    ],
  });

  const page = await browser.newPage();

  try {
    // Navigate to the URL
    isError = false;
    await page.goto(url, { waitUntil: "networkidle2", timeout });

    // Wait for login button and click it
    await page.waitForSelector(".header_log-in", { visible: true, timeout });
    console.log("Main page loaded.");
    await page.click(".header_log-in");
    console.log("Login button clicked.");
    // Wait for email input field
    await page.waitForSelector('input[name="email"]', {
      visible: true,
      timeout,
    });

    // Type email
    await page.type('input[name="email"]', email, { delay: 200 });

    // Wait for password input field
    await page.waitForSelector('input[name="password"]', {
      visible: true,
      timeout,
    });

    // Type password
    await page.type('input[name="password"]', password, { delay: 200 });

    // Submit the login form
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil: "load", timeout });
    console.log("Login successful");
    await page.waitForSelector(".header_log-in", { visible: true, timeout });
    await page.click(".header_log-in");

    await page.goto(
      "https://www.skynews.com.au/stream/sky-news-australia/video/af5a31edc4f5a624839058db6f9260c7",
      { waitUntil: "load", timeout }
    );

    await page.waitForSelector(".rp-muted-autoplay", {
      visible: true,
      timeout,
    });
    await page.click(".rp-muted-autoplay");
  } catch (error) {
    console.error("Error during login process:", error.message);
    isError = true;
  } finally {
    // Optional: Keep browser open or close based on your needs
    // await browser.close();
  }
  // Start FFmpeg to capture audio in chunks
  ffmpegProcess = isError ? null : startFFmpegRecording();
};

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
export const startTVStream = (
  url = "https://www.skynews.com.au",
  email = process.env.SKY_NEWS_EMAIL,
  password = process.env.SKY_NEWS_PASSWORD
) => playVideoStream(url, email, password);
