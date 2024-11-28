import puppeteer from "puppeteer";
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename, "utf-8");

const AUDIO_PREFIX = "abc-news"; // Constant variable for the prefix
const FILE_PATH = ["tvFiles", AUDIO_PREFIX];

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
  startFFmpegRecording();
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
      // Call your custom function or logic here
      onChunkCreated(newFile);
    }
  });

  ffmpegProcess.on("close", (code) => {
    console.log(`FFmpeg process exited with code ${code}`);
  });

  return ffmpegProcess;
};

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

    unlinkSync(filePath);
    return response.data.upload_url;
  } catch (error) {
    console.error("Error uploading audio file:", error.message);
    throw error;
  }
};

const onChunkCreated = (filePath) => {
  console.log(`Chunk started: ${filePath}`);
  const fileName = path.basename(filePath).replace(".mp3", "");
  const array = fileName.split("-");

  const chunkIndex = array[array.length - 1];
  const oldFilePath = path.join(
    __dirname,
    ...FILE_PATH,
    `${AUDIO_PREFIX}-${chunkIndex - 1}.mp3`
  );

  if (fs.existsSync(oldFilePath)) {
    console.log(`Chunk completed: ${oldFilePath}`);
  }

  // Perform any actions like moving files, processing them, etc.
};

// Run the video and audio capture
playYouTubeVideo("https://youtu.be/vOTiJkg1voo");
