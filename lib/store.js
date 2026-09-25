import { readFileSync, renameSync, unlinkSync, mkdirSync, openSync, writeSync, fsyncSync, closeSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

function load(file) {
  let text;
  try { text = readFileSync(file, "utf8"); }
  catch (err) {
    if (err.code === "ENOENT") return {};
    throw new Error(`cannot read ${file}: ${err.message}`, { cause: err });
  }
  if (!text.trim()) { console.warn(`${file} is empty, starting with a blank store`); return {}; }
  let parsed;
  try { parsed = JSON.parse(text); }
  catch (err) { throw new Error(`${file} is not valid JSON: ${err.message}. The file is untouched - fix it, or move it aside to start fresh.`, { cause: err }); }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed))
    throw new Error(`${file} should hold a JSON object, found ${parsed === null ? "null" : Array.isArray(parsed) ? "an array" : typeof parsed}. The file is untouched - fix it, or move it aside to start fresh.`);
  return parsed;
}

export function createStore(file) {
  const state = load(file);

  function write() {
    const tmp = `${file}.${process.pid}.tmp`;
    try {
      mkdirSync(dirname(file), { recursive: true });
      const fd = openSync(tmp, "w");
      try { writeSync(fd, JSON.stringify(state)); fsyncSync(fd); } finally { closeSync(fd); }
      renameSync(tmp, file);
    } catch (err) {
      try { unlinkSync(tmp); } catch { }
      throw new Error(`cannot write ${file}: ${err.message}`, { cause: err });
    }
  }

  return {
    file,
    get: (key) => state[key],
    set(key, value) {
      if (value === undefined) delete state[key];
      else state[key] = value;
      write();
    },
  };
}

const FILE = fileURLToPath(new URL("../data/state.json", import.meta.url));
export const { get, set } = createStore(FILE);
