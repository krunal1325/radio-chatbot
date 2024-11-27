import twilio from "twilio";
import dotenv from "dotenv";

dotenv.config();

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

export const sendSMS = async (phoneNumber, message) => {
  try {
    return await client.messages.create({
      from: process.env.TWILIO_NUMBER,
      to: phoneNumber,
      body: message,
    });
  } catch (error) {
    return null;
  }
};
