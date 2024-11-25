import { Pinecone } from "@pinecone-database/pinecone";
import dotenv from "dotenv";
import { format } from "date-fns";
dotenv.config();

const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
