import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);
const model2 = genAI.getGenerativeModel({ model: "text-embedding-004" });

export const embedText = async (text) => {
  try {
    const result = await model2.embedContent(text);
    return result.embedding;
  } catch (error) {
    console.error("Error generating embeddings:", error.message);
    throw error;
  }
};
