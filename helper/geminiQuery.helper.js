import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY2);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

export const geminiQuery = async ({ data }) => {
  try {
    const prompt = `
      Live Channel Monitoring: Australian Political Leaders and AFL Coaches

      Specific Individuals or Parties to Monitor:
      ### Political Leaders:
      1. Prime Minister Anthony Albanese (Labor Party; ALP)
      2. Treasurer Jim Chalmers (Labor Party; ALP)
      3. Opposition Leader Peter Dutton (Liberal Party; Coalition)
      4. Deputy Opposition Leader Sussan Ley (Liberal Party; Coalition)
      5. Greens Leader Adam Bandt (Australian Greens)
      6. Nationals Leader David Littleproud (The Nationals; Coalition)

      ### AFL Coaches:
      1. Brad Scott (Essendon coach)
      2. Michael Voss (Carlton coach)
      3. Dean Cox (Sydney coach)
      4. Craig McRae (Collingwood coach)
      5. Chris Scott (Geelong coach)
      6. Simon Goodwin (Melbourne coach)

      Monitoring Instructions:
      - Check the provided data to identify if any of the listed individuals or their associated parties/designations are mentioned as CURRENTLY LIVE.
      - Focus exclusively on live events such as speeches, press conferences, or media appearances.
      - Include only verifiable and relevant information about ongoing or upcoming live appearances for the listed individuals or parties.
      - CRITICAL: If NONE of these individuals or parties are live, return "null."

      Provided Data:
      ${data}
    `;

    const systemInstruction = `
      Response Protocol:
      - Respond ONLY if a specified individual is live, providing the name, role, and channel/event where they are live.
      - If none of the specified individuals are live, respond with "null".
      - Do NOT include summaries, analysis, or irrelevant information.

      Output Requirements:
      - STRICTLY mention ongoing live appearances.
      - If no live appearances are found, return "null"
      - Provide concise and verifiable information only
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
    console.log(responseText, "responseText");
    if (
      !responseText ||
      responseText === "null" ||
      responseText.includes("no relevant information")
    ) {
      console.log("No live appearances found for the specified leaders.");
      return null;
    }

    console.log("Gemini response:", responseText);
    return responseText;
  } catch (error) {
    console.error("Error calling Gemini:", error.message);
    throw new Error("Failed to fetch response from Gemini.");
  }
};
