import { AssemblyAI } from "assemblyai";
import dotenv from "dotenv";
import { readFileSync, unlinkSync } from "fs";

dotenv.config();

const assemblyai = new AssemblyAI({
  apiKey: process.env.ASSEMBLY_AI_KEY,
  verbose: true,
});

const uploadAudio = (filePath) => {
  try {
    const fileContent = readFileSync(filePath);
    const fileUrl = assemblyai.files.upload(fileContent, "audio/mpeg");
    unlinkSync(filePath);
    return fileUrl;
  } catch (error) {
    console.error("Error uploading audio file:", error.message);
  }
};

const submitForTranscription = async (fileUrl) => {
  try {
    const transcript = await assemblyai.transcripts.submit({
      audio_url: fileUrl,
      speaker_labels: true,
    });
    return transcript;
  } catch (error) {
    console.error("Error transcribing audio:", error.message);
  }
};

const getTranscriptionStatus = async (transcriptId) => {
  try {
    const transcript = await assemblyai.transcripts.get(transcriptId);
    return transcript;
  } catch (error) {
    console.error("Error fetching transcription status:", error.message);
  }
};

const getTranscriptText = async (transcriptId) => {
  try {
    const transcript = await assemblyai.transcripts.get(transcriptId);
    return (transcript.utterances || [])
      .map((utterance) => {
        return `Speaker ${utterance.speaker}: ${utterance.text}`;
      })
      .join("\n");
  } catch (error) {
    console.error("Error fetching transcript text:", error.message);
  }
};

const pollTranscriptionStatus = async (transcriptionId) => {
  while (true) {
    const transcriptionResult = await getTranscriptionStatus(transcriptionId);
    const status = transcriptionResult.status;

    if (status === "completed") {
      return transcriptionResult;
    } else if (status === "failed") {
      return null;
    } else {
      await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait before checking again
    }
  }
};

export {
  assemblyai,
  uploadAudio,
  submitForTranscription,
  getTranscriptionStatus,
  getTranscriptText,
  pollTranscriptionStatus,
};
