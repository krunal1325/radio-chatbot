import { CronJob } from "cron";
import { embedText } from "../helper/embedding.helper.js";
import { geminiQuery } from "../helper/geminiQuery.helper.js";
import { pineconeQuery } from "../helper/pinecone.helper.js";
import dotenv from "dotenv";
import { sendWhatsAppMessage } from "../helper/twilio.helper.js";
import { ChannelNames } from "../helper/constant.helper.js";

dotenv.config();

const TIME_FOR_SEARCH_QUERY = Number(process.env.TIME_FOR_SEARCH_QUERY) || 10;
const keywords = [
  // Political Designations & Names
  "Prime Minister Anthony Albanese",
  "Anthony Albanese Labor Party",
  "Opposition Leader Peter Dutton",
  "Peter Dutton Liberal Party",
  "Treasurer Jim Chalmers",
  "Jim Chalmers Labor Party",
  "David Littleproud Nationals Leader",
  "Adam Bandt Greens Leader",
  "Adam Bandt Australian Greens",

  // Role-Based Phrases
  "Prime Minister of Australia",
  "Opposition Leader of Australia",
  "Labor Party Treasurer",
  "Australian Greens Leader",
  "Liberal Party Leader",
  "Nationals Leader",

  // Generic Variations for Broader Search
  "Australian political leaders live",
  "Labor Party live update",
  "Liberal Party press conference",
  "Australian Greens live event",
  "Anthony Albanese live event",
  "Peter Dutton speech",
  "Jim Chalmers media appearance",
  "David Littleproud news update",
  "Adam Bandt press conference",

  // AFL Coaches
  "Brad Scott Essendon coach",
  "Michael Voss Carlton coach",
  "Dean Cox Sydney coach",
  "Craig McRae Collingwood coach",
  "Chris Scott Geelong coach",
  "Simon Goodwin Melbourne coach",

  // Generic Variations for AFL Coaches
  "Essendon coach Brad Scott",
  "Carlton coach Michael Voss",
  "Sydney coach Dean Cox",
  "Collingwood coach Craig McRae",
  "Geelong coach Chris Scott",
  "Melbourne coach Simon Goodwin",
  "AFL coaches live update",
  "AFL press conference",
  "AFL coach media appearance",
];

export const search = async (channel_name, queryBody = "") => {
  try {
    const query = queryBody || keywords.join(",");
    console.log("Generating embeddings for the query...");
    const embedding = await embedText(query);
    console.log("Searching Pinecone for similar results...");
    const results = await pineconeQuery({
      embedding,
      channel_name,
      minutes: TIME_FOR_SEARCH_QUERY,
    });

    console.log("Results retrieved, formatting response...");

    const combinedMetadata = results
      .map((result) => result.metadata?.source || "")
      .join(" ");

    console.log("Sending prompt to Gemini...");

    const geminiResponse = await geminiQuery({ data: combinedMetadata });

    if (!geminiResponse) {
      console.log("No relevant information found, skipping SMS.");
      return null; // Return null if no data is available to avoid sending SMS
    }

    console.log("Gemini response generated.");
    return geminiResponse;
  } catch (error) {
    console.error("Error executing cron job:", error.message);
  }
};

// Cron job logic for scheduled search
export const searchCronjob = new CronJob(
  `*/${TIME_FOR_SEARCH_QUERY} * * * *`, // cronTime every 20 minutes
  async function () {
    try {
      const phoneNumbers = ["+917405709622", "+61401831400"];
      console.log("Executing scheduled search...");
      const AW3Response = await search(ChannelNames["3AW"]);
      if (AW3Response) {
        sendWhatsAppMessage(
          phoneNumbers,
          `\n${AW3Response}\nFROM: ${ChannelNames["3AW"]}`
        );
      }
      const twoGBResponse = await search(ChannelNames["2GB"]);
      if (twoGBResponse) {
        sendWhatsAppMessage(
          phoneNumbers,
          `\n${twoGBResponse}\nFROM: ${ChannelNames["2GB"]}`
        );
      }
      const abcNewsResponse = await search(ChannelNames.ABC_NEWS);
      if (abcNewsResponse) {
        sendWhatsAppMessage(
          phoneNumbers,
          `\n${abcNewsResponse}\nFROM: ${ChannelNames.ABC_NEWS}`
        );
      }
      const skyNewsResponse = await search(ChannelNames.SKY_NEWS);
      if (skyNewsResponse) {
        sendWhatsAppMessage(
          phoneNumbers,
          `\n${skyNewsResponse}\nFROM: ${ChannelNames.SKY_NEWS}`
        );
      }
      const foxSportsNewsResponse = await search(ChannelNames.FOX_SPORTS_NEWS);
      if (foxSportsNewsResponse) {
        sendWhatsAppMessage(
          phoneNumbers,
          `\n${foxSportsNewsResponse}\nFROM: ${ChannelNames.FOX_SPORTS_NEWS}`
        );
      }
    } catch (error) {
      console.error("Cron job error:", error.message);
    }
  }
);
