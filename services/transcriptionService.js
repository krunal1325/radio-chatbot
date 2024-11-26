import { readFileSync, writeFileSync } from "fs";
import dotenv from "dotenv";
import { AssemblyAI } from "assemblyai";
import { storeInPinecone } from "./pineconeService.js";
import { embedText } from "./embeddingService.js";

dotenv.config();

const assemblyAI = new AssemblyAI({
  apiKey: process.env.ASSEMBLY_AI_KEY,
});

export const uploadAudio = async (filePath) => {
  try {
    const file = readFileSync(filePath);
    const response = await assemblyAI.files.upload(file);
    return response;
  } catch (error) {
    console.error("Error uploading audio file:", error.message);
    throw error;
  }
};

// Poll transcription status until it is completed or failed
export const pollTranscriptionStatus = async (transcriptionId, chunkIndex) => {
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

export const saveTranscriptionFiles = async (
  transcriptionResult,
  chunkIndex,
  start_time,
  end_time,
  radioName
) => {
  const todayFolder = getTodayFolderPath();
  const transcriptionFileName = `transcription-${chunkIndex}.txt`;

  // Save transcription as TXT
  const transcriptionTxtFilePath = path.join(
    todayFolder,
    transcriptionFileName
  );

  console.log("Converting transcription to TXT...");

  const txtContent = (transcriptionResult.utterances || [])
    .map((utterance) => {
      return `Speaker ${utterance.speaker}: ${utterance.text}`;
    })
    .join("\n");

  console.log(`Saving transcription as TXT to ${transcriptionTxtFilePath}`);
  writeFileSync(transcriptionTxtFilePath, txtContent);

  // Generate and store embeddings
  console.log("Generating embeddings...");
  const embedding = await embedText(txtContent);
  const uniqueId = `transcription-${chunkIndex}`;
  await storeInPinecone(
    uniqueId,
    embedding.values,
    txtContent,
    start_time,
    end_time,
    radioName
  );

  console.log("Transcription TXT saved.");
};

// Transcribe audio function
export const transcribeAudio = async (
  filePath,
  start_time,
  end_time,
  radioName
) => {
  if (!filePath || !fs.existsSync(filePath)) {
    console.error(`File ${filePath} is missing or not fully written yet.`);
    return;
  }

  const chunkIndex = path.basename(filePath, ".mp3").split("-")[2];

  try {
    const uploadUrl = await uploadAudio(filePath);
    const response = await assemblyAI.transcripts.submit(uploadUrl, {
      speaker_labels: true,
    });
    const transcriptionId = response.id;

    // Poll the transcription status
    const transcriptionResult = await pollTranscriptionStatus(
      transcriptionId,
      chunkIndex
    );

    if (transcriptionResult) {
      saveTranscriptionFiles(
        transcriptionResult,
        chunkIndex,
        start_time,
        end_time,
        radioName
      );
    }
  } catch (error) {
    console.error("Error transcribing the audio file:", error.message);
  }
};

const getTranscriptionStatus = async (transcriptionId) => {
  try {
    const response = await assemblyAI.transcripts.get(transcriptionId);
    return response;
  } catch (error) {
    console.error("Error fetching transcription status:", error.message);
    throw error;
  }
};
