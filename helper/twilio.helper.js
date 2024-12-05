import twilio from "twilio";
import dotenv from "dotenv";

dotenv.config();

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

export const sendSMS = async (phoneNumbers, message) => {
  try {
    // Map through the array of phone numbers and send SMS to each
    const results = await Promise.all(
      phoneNumbers.map((phoneNumber) =>
        client.messages.create({
          from: process.env.TWILIO_NUMBER,
          to: phoneNumber,
          body: message,
        })
      )
    );
    return results; // Return the array of results
  } catch (error) {
    console.error("Error sending SMS:", error);
    return null;
  }
};

export const sendWhatsAppMessage = async (phoneNumbers, message) => {
  try {
    // Map through the array of phone numbers and send WhatsApp messages to each
    const results = await Promise.all(
      phoneNumbers.map((phoneNumber) =>
        client.messages.create({
          from: `whatsapp:${process.env.TWILIO_NUMBER}`,
          to: `whatsapp:${phoneNumber}`,
          contentSid: process.env.TWILIO_CONTENT_SID,
          body: message,
        })
      )
    );
    return results; // Return the array of results
  } catch (error) {
    console.error("Error sending WhatsApp messages:", error);
    return null;
  }
};
