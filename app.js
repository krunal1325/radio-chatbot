import axios from "axios";
import { readFileSync, writeFileSync } from "fs";
import dotenv from "dotenv";
dotenv.config();
import path, { resolve as _resolve } from "path";
import { fileURLToPath } from "url";

const API_KEY = process.env.ASSEMBLY_AI_KEY; // Add your API key in a .env file
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename, "utf-8");
const AUDIO_FILE_PATH = _resolve(__dirname, "live-stream-57.mp3"); // Replace with the path to your MP3 file

async function uploadAudio(filePath) {
  try {
    const file = readFileSync(filePath);
    const response = await axios.post(
      "https://api.assemblyai.com/v2/upload",
      file,
      {
        headers: {
          authorization: API_KEY,
          "content-type": "application/octet-stream",
        },
      }
    );
    return response.data.upload_url;
  } catch (error) {
    console.error("Error uploading audio file:", error.message);
    throw error;
  }
}

async function transcribeAudio(uploadUrl) {
  try {
    const response = await axios.post(
      "https://api.assemblyai.com/v2/transcript",
      {
        audio_url: uploadUrl,
        speaker_labels: true, // Enable speaker diarization
      },
      {
        headers: {
          authorization: API_KEY,
        },
      }
    );
    return response.data.id;
  } catch (error) {
    console.error("Error starting transcription:", error.message);
    throw error;
  }
}

async function getTranscriptionStatus(transcriptionId) {
  try {
    const response = await axios.get(
      `https://api.assemblyai.com/v2/transcript/${transcriptionId}`,
      {
        headers: {
          authorization: API_KEY,
        },
      }
    );
    return response.data;
  } catch (error) {
    console.log(error);
    console.error("Error fetching transcription status:", error.message);
    throw error;
  }
}

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

(async () => {
  try {
    console.log("Uploading audio...");
    const uploadUrl = await uploadAudio(AUDIO_FILE_PATH);
    console.log("Audio uploaded:", uploadUrl);

    console.log("Starting transcription...");
    const transcriptionId = await transcribeAudio(uploadUrl);
    console.log("Transcription started. ID:", transcriptionId);

    let status = "processing";
    let transcriptionResult;

    while (status === "processing") {
      console.log("Checking transcription status...");
      transcriptionResult = await getTranscriptionStatus(transcriptionId);
      status = transcriptionResult.status;

      if (status === "completed") {
        console.log("Transcription completed successfully.");
      } else if (status === "failed") {
        console.error("Transcription failed:", transcriptionResult.error);
        return;
      } else {
        console.log("Still processing, please wait...");
        await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait for 5 seconds before checking again
      }
    }
    if (status === "completed") {
      console.log("Grouping transcription by speaker...");
      const speakerTranscription = groupBySpeaker(transcriptionResult);
      console.log("Transcription grouped by speaker.", speakerTranscription);

      console.log("Saving grouped transcription...");
      writeFileSync(
        "transcription.json",
        JSON.stringify(speakerTranscription, null, 2)
      );
      console.log("Transcription saved to transcription.json.");
    }
  } catch (error) {
    console.error("Error processing audio file:", error.message);
  }
})();
