import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

export const geminiQuery = async ({ data }) => {
  try {
    const prompt = `
      Focused Political Analysis: Australian Political Leaders

      Specific Individuals to Analyze:
      1. Prime Minister Anthony Albanese (Labor Party; ALP)
      2. Treasurer Jim Chalmers (Labor Party; ALP)
      3. Opposition Leader Peter Dutton (Liberal Party; coalition)
      4. Deputy Opposition Leader Sussan Ley (Liberal Party; coalition)
      5. Greens Leader Adam Bandt (Australian Greens)
      6. Nationals Leader David Littleproud (The Nationals; coalition)

      Strict Analysis Requirements:
      - ONLY report information DIRECTLY related to the listed political leaders
      - Identify specific activities, statements, or policy discussions by these individuals
      - Include media appearances, press conferences, or direct quotes
      - CRITICAL: If NO information exists about these specific leaders, return NULL
      - Do NOT include or summarize unrelated information

      Provided Data:
      ${data}
    `;

    const systemInstruction = `
      Response Protocol:

      Absolute Criteria:
      - MANDATORY: Only return information about the specified Australian political leaders
      - REJECT any data not directly related to Albanese, Chalmers, Dutton, Ley, Bandt, or Littleproud
      - IF NO relevant information exists about these leaders, RETURN "null"
      - IGNORE all peripheral or unrelated information
      - Provide ZERO summary of irrelevant data

      Output Requirements:
      - Strict focus on political leaders mentioned in the prompt
      - Include ONLY verifiable, direct information about these individuals
      - No speculation or tangential reporting
      - Immediate NULL return if no specific leader information exists
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
          text: systemInstruction,
        },
      },
    });

    // Extract and validate the response content
    const responseText =
      response?.response?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

    if (
      !responseText ||
      responseText === "null" ||
      responseText.includes("no relevant information")
    ) {
      console.log("No relevant data found for specified political leaders.");
      return null;
    }

    console.log("Gemini response:", responseText);
    return responseText;
  } catch (error) {
    console.error("Error calling Gemini:", error.message);
    throw new Error("Failed to fetch response from Gemini.");
  }
};
