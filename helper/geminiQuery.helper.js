import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY2);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

export const geminiQuery = async ({ data, query }) => {
  try {
    const prompt = `
        The user asked: "${query}".
        Here is the related information retrieved from our database:
        ${data}.
      `;

    const response = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: {
            text: prompt,
          },
        },
      ],
      systemInstruction: {
        role: "system",
        parts: {
          text: `
              Instructions for the response:
              - Respond **only** based on the provided database information.
              - For each individual mentioned, summarize their recent activities, statements, or actions, and include relevant policies or positions.
              - Specify if they have been live or recently active on any media platforms.
              - Use bullet points for clarity.
              - Exclude individuals who do not have relevant data. Do not mention them in the response.
              - If no relevant data exists for **any** of the individuals, return null.
              - Ensure the response is concise, professional, and accurately reflects the provided data.
              - Avoid assumptions or fabrication of information.
            `,
        },
      },
    });

    // Check if the AI response indicates no relevant information
    const responseText =
      response.response.candidates[0]?.content?.parts[0]?.text;

    console.log("Gemini response:", responseText);
    if (
      responseText?.trim() === "No relevant information found." ||
      responseText?.trim() === "null"
    ) {
      return null; // Explicitly return null to indicate no data
    }

    return responseText;
  } catch (error) {
    console.error("Error calling Gemini:", error.message);
    throw new Error("Failed to fetch response from Gemini.");
  }
};
