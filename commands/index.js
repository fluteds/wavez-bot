import { readdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_COOLDOWN = 3000;

export const ROLES = ["user", "resident_dj", "bouncer", "manager", "cohost", "host"];
const RANKS = new Map(ROLES.map((role, index) => [role, index]));

export const isRole = (role) => RANKS.has(role);

export const actorRank = (role) => RANKS.get(role) ?? -1;
export const targetRank = (role) => RANKS.get(role) ?? ROLES.length;

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
    if (mod.minRole != null && !isRole(mod.minRole)) throw new Error(`${path}: minRole "${mod.minRole}" is not a role. Use one of: ${ROLES.join(", ")}`);
    mod.category = dirname(path).split("/").pop();
    mod.cooldown ??= DEFAULT_COOLDOWN;
    commands.push(mod);
    for (const trigger of [mod.name, ...(mod.aliases ?? [])]) {
      const key = trigger.toLowerCase();
      if (registry.has(key)) throw new Error(`${path}: trigger "${key}" is already registered by ${registry.get(key).name}`);
      registry.set(key, mod);
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

export const withReason = (text, reason) => `${text} reason: ${reason || "no reason"}`;

export function meetsRole(command, role) {
  const minRole = command.minRole;
  if (minRole == null) return true;
  if (!isRole(minRole)) { console.error(`refusing ${command.name ?? "command"}: minRole "${minRole}" is not a role`); return false; }
  return actorRank(role ?? "user") >= actorRank(minRole);
}
