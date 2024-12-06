import { existsSync, mkdirSync } from "fs";
import path, { join } from "path";
import ytdl from "ytdl-core";
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";
import { fileURLToPath } from "url";
import {
  pollTranscriptionStatus,
  submitForTranscription,
  uploadAudio,
} from "../helper/assemblyAI.helper.js";
import { storeInPinecone } from "../helper/pinecone.helper.js";
import { ChannelNames } from "../helper/constant.helper.js";

// Set FFmpeg path for fluent-ffmpeg
ffmpeg.setFfmpegPath(ffmpegPath);

let start_time = null;
let end_time = null;
const outputDirectory = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "files"
);
const chunkDuration = 60;

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
    channelName: ChannelNames.ABC_NEWS,
  });

  console.log("Transcription TXT saved.");
};

export async function downloadYoutubeLiveChunks(
  videoUrl = "https://youtu.be/vOTiJkg1voo"
) {
  try {
    console.log("Checking video info...");
    const info = await ytdl.getInfo(videoUrl);

    if (!info.videoDetails.isLiveContent) {
      throw new Error("The provided video is not a live stream.");
    }

    // Create output directory if it doesn't exist
    if (!existsSync(outputDirectory)) {
      mkdirSync(outputDirectory, { recursive: true });
    }

    const audioStream = ytdl(videoUrl, { quality: "highestaudio" });

    console.log("Recording live audio into chunks...");
    let chunkIndex = 1;

    function recordChunk() {
      const chunkPath = join(outputDirectory, `chunk-${chunkIndex}.mp3`);
      console.log(`Recording chunk ${chunkIndex}...`);

      const process = ffmpeg(audioStream)
        .audioCodec("libmp3lame")
        .toFormat("mp3")
        .duration(chunkDuration) // Record for the specified duration
        .on("end", async () => {
          start_time = new Date().getTime() - chunkDuration * 1000;
          end_time = new Date().getTime();
          console.log(`Chunk ${chunkIndex} saved to ${chunkPath}`);
          const uploadURL = await uploadAudio(chunkPath);
          console.log("Audio uploaded.");
          const transcription = await submitForTranscription(uploadURL);
          const transcriptionId = transcription.id;
          console.log("Transcription started.");
          const transcriptionResult = await pollTranscriptionStatus(
            transcriptionId
          );
          console.log("Transcription completed.");
          if (transcriptionResult) {
            await saveTranscriptionFiles(
              transcriptionResult,
              start_time,
              end_time
            );
          }
          chunkIndex += 1;
          recordChunk(); // Start the next chunk
        })
        .on("error", (err) => {
          console.error(`Error recording chunk ${chunkIndex}:`, err);
        })
        .save(chunkPath);
    }

    recordChunk(); // Start recording the first chunk
  } catch (error) {
    console.error("Error:", error);
  }
}
