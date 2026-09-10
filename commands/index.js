// commands/index.js - loads every .js under commands/ recursively (excluding itself), registering each by name and aliases.
// A command module default-exports:
//   name: string - primary trigger, without the prefix
//   aliases?: string[] - alternative triggers
//   description?: string - shown in !help
//   usage?: string - shown in !help <command>
//   cooldown?: number - per-user cooldown in ms, default 3000
//   minRole?: string - minimum room role, see ROLES below
//   execute(ctx): Promise<string | void> - a returned string is sent as a reply

import { readdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_COOLDOWN = 3000;

// Ascending authority
export const ROLES = ["user", "resident_dj", "bouncer", "manager", "cohost", "host"];

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(path)));
    else if (entry.name.endsWith(".js") && path !== join(HERE, "index.js")) out.push(path);
  }
  return out;
}

export async function loadCommands() {
  const registry = new Map();
  const commands = [];
  for (const path of await walk(HERE)) {
    const mod = (await import(pathToFileURL(path).href)).default;
    if (!mod?.name || typeof mod.execute !== "function") { console.warn(`skipping ${path}: no name/execute`); continue; }
    mod.category = dirname(path).split("/").pop();
    mod.cooldown ??= DEFAULT_COOLDOWN;
    commands.push(mod);
    for (const trigger of [mod.name, ...(mod.aliases ?? [])]) {
      if (registry.has(trigger)) console.warn(`duplicate trigger "${trigger}" in ${path}`);
      registry.set(trigger.toLowerCase(), mod);
    }
  }
  return { registry, commands };
}

const lastUsed = new Map();
export function onCooldown(command, userId) {
  const key = `${command.name}:${userId}`;
  const now = Date.now();
  if (now - (lastUsed.get(key) ?? 0) < command.cooldown) return true;
  lastUsed.set(key, now);
  return false;
}

// Every mod action announces a reason, stated or not.
export const withReason = (text, reason) => `${text} reason: ${reason || "no reason"}`;

export const meetsRole = (command, role) =>
  !command.minRole || ROLES.indexOf(role ?? "user") >= ROLES.indexOf(command.minRole);
