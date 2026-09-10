// lib/store.js - the one JSON file for state that has to outlive a restart.
// Synchronous on purpose: it holds a handful of keys, and a write per command is cheaper than the bookkeeping an async queue would need.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const FILE = fileURLToPath(new URL("../data/state.json", import.meta.url));

let state = {};
try { state = JSON.parse(readFileSync(FILE, "utf8")); } catch { mkdirSync(dirname(FILE), { recursive: true }); } // first run has no file

export const get = (key) => state[key];

export function set(key, value) {
  if (value === undefined) delete state[key];
  else state[key] = value;
  writeFileSync(FILE, JSON.stringify(state));
}
