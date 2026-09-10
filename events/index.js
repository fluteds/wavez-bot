// events/index.js - loads every .js in events/ (excluding itself). Each module default-exports { event: string, handler(payload, bot): void }.
// `event` is the socket packet name; use "packet" for every packet. There is no "*" wildcard.

import { readdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

export async function loadEvents(bot) {
  const files = (await readdir(HERE)).filter((f) => f.endsWith(".js") && f !== "index.js");
  for (const file of files) {
    const mod = (await import(pathToFileURL(join(HERE, file)).href)).default;
    if (!mod?.event || typeof mod.handler !== "function") { console.warn(`skipping events/${file}: no event/handler`); continue; }
    bot.rt.on(mod.event, (packet) => mod.handler(packet.payload ?? {}, bot));
  }
  return files.length;
}
