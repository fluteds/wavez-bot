import { readFileSync } from "node:fs";
import { WavezBot } from "./lib/bot.js";

process.loadEnvFile(new URL("./.env", import.meta.url)); // stdlib dotenv, no dependency
const config = JSON.parse(readFileSync(new URL("./config/config.json", import.meta.url), "utf8"));
const baseURL = process.env.WAVEZ_API_URL ?? "https://api.wavez.fm";
const { WAVEZ_BOT_TOKEN: botToken, WAVEZ_ROOM_ID: roomId } = process.env;
if (!botToken || !roomId) throw new Error("Set WAVEZ_BOT_TOKEN and WAVEZ_ROOM_ID in .env");

const bot = await new WavezBot({ baseURL, botToken, roomId, config }).start();
process.on("SIGINT", () => { bot.stop(); process.exit(0); });
