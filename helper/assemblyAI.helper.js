import { AssemblyAI } from "assemblyai";
import dotenv from "dotenv";

dotenv.config();

const assemblyai = new AssemblyAI({
  apiKey: process.env.ASSEMBLY_AI_KEY,
  verbose: true,
});

const uploadAudio = (filePath) => {
  try {
    const fileUrl = assemblyai.files.upload(filePath);
    return fileUrl;
  } catch (error) {
    console.error("Error uploading audio file:", error.message);
  }
};

const submitForTranscription = async (fileUrl) => {
  try {
    const transcript = await assemblyai.transcripts.submit(fileUrl);
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

export {
  assemblyai,
  uploadAudio,
  submitForTranscription,
  getTranscriptionStatus,
  getTranscriptText,
};
