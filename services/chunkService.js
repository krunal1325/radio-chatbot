import { format } from "date-fns";
import { readFileSync, existsSync, writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { transcribeAudio } from "./transcriptionService.js";
import fs from "fs";

// Create __dirname equivalent in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.resolve(path.dirname(__filename, "utf-8"), "..");

export const getChunkIndex = () => {
  const indexFilePath = path.join(__dirname, "files", "chunkIndex.json");
  if (existsSync(indexFilePath)) {
    const indexData = JSON.parse(readFileSync(indexFilePath));
    return indexData.index;
  }
  return 1; // Default starting value if the file doesn't exist
};

export const setChunkIndex = (index) => {
  const indexFilePath = path.join(__dirname, "files", "chunkIndex.json");
  writeFileSync(indexFilePath, JSON.stringify({ index }, null, 2));
};

const getTodayFolderPath = () => {
  const today = new Date();
  const folderName = format(today, "yyyy-MM-dd");
  const folderPath = path.join(__dirname, "files", folderName);
  if (!existsSync(folderPath)) {
    mkdirSync(folderPath, { recursive: true });
  }
  return folderPath;
};

export const startNewChunk = (
  chunkIndex,
  fileStream,
  currentChunkStartTime
) => {
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
      transcribeAudio(
        completedChunkPath,
        currentChunkStartTime,
        new Date(),
        radioName
      ).catch((err) =>
        console.error(`Error transcribing ${completedChunkPath}:`, err.message)
      );
      fileStream = fs.createWriteStream(newChunkPath);
      chunkIndex++;
      setChunkIndex(chunkIndex); // Save the updated chunk index
      console.log(`Started new chunk: ${path.basename(newChunkPath)}`);
      currentChunkStartTime = new Date();
    });
  } else {
    console.log(`Started first chunk: ${path.basename(newChunkPath)}`);
    currentChunkStartTime = new Date();
    fileStream = fs.createWriteStream(newChunkPath);
  }
};
