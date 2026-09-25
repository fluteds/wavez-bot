import assert from "node:assert";
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createStore } from "../lib/store.js";

const root = mkdtempSync(join(tmpdir(), "wavez-store-"));
let n = 0;
const fresh = () => join(mkdtempSync(join(root, `case-${n++}-`)), "state.json");
const quiet = () => { const real = console.warn; console.warn = () => { }; return () => { console.warn = real; }; };

{
  const file = join(root, "never-written", "state.json");
  const store = createStore(file);
  assert.equal(store.get("macros"), undefined, "an unwritten store reads empty");
  assert.equal(existsSync(file), false, "reading alone does not create the file");
  store.set("macros", { fomo: { text: "hi", minRole: null } });
  assert.equal(existsSync(file), true, "the first write creates the file and its directory");
}

{
  const file = fresh();
  const first = createStore(file);
  first.set("history", [{ title: "Ghostlight", woots: 5 }]);
  first.set("spoke", { u1: 1700000000000 });
  first.set("macros", {});
  const second = createStore(file);
  assert.deepEqual(second.get("history"), [{ title: "Ghostlight", woots: 5 }]);
  assert.deepEqual(second.get("spoke"), { u1: 1700000000000 });
  assert.deepEqual(second.get("macros"), {});
  assert.equal(second.get("nothing"), undefined);
  second.set("spoke", undefined);
  assert.equal(createStore(file).get("spoke"), undefined, "a deleted key stays deleted");
  assert.deepEqual(Object.keys(JSON.parse(readFileSync(file, "utf8"))), ["history", "macros"]);
}

for (const broken of ['{"macros":', "not json at all", '{"a":1}{"b":2}', '{"a":1,}']) {
  const file = fresh();
  writeFileSync(file, broken);
  assert.throws(() => createStore(file), (err) => {
    assert.match(err.message, /is not valid JSON/, "the message says what is wrong");
    assert.ok(err.message.includes(file), "and which file to look at");
    assert.match(err.message, /untouched/, "and that nothing was thrown away");
    return true;
  }, `${broken} must not load`);
  assert.equal(readFileSync(file, "utf8"), broken, "the corrupt file is preserved byte for byte");
}

for (const [text, what] of [["[1,2,3]", /an array/], ['"a string"', /string/], ["42", /number/], ["null", /null/]]) {
  const file = fresh();
  writeFileSync(file, text);
  assert.throws(() => createStore(file), (err) => what.test(err.message) && /JSON object/.test(err.message), `${text} is not a store`);
  assert.equal(readFileSync(file, "utf8"), text, "and it is left alone");
}

{
  const file = fresh();
  writeFileSync(file, "");
  const warnings = [];
  const real = console.warn;
  console.warn = (msg) => warnings.push(String(msg));
  const store = createStore(file);
  console.warn = real;
  assert.equal(store.get("macros"), undefined);
  assert.equal(warnings.length, 1, "an empty store is reported, not assumed");
  assert.match(warnings[0], /is empty/);
}

if (process.getuid?.() !== 0) {
  const file = fresh();
  writeFileSync(file, '{"a":1}');
  chmodSync(file, 0o000);
  assert.throws(() => createStore(file), /cannot read .*state\.json/, "a permissions problem is reported, not swallowed");
  chmodSync(file, 0o600);
  assert.deepEqual(createStore(file).get("a"), 1, "and it loads again once readable");
}

if (process.getuid?.() !== 0) {
  const dir = mkdtempSync(join(root, "locked-"));
  const file = join(dir, "state.json");
  const store = createStore(file);
  store.set("history", ["keep me"]);
  chmodSync(dir, 0o500);
  assert.throws(() => store.set("history", ["lose me"]), (err) => {
    assert.match(err.message, /cannot write/, "a failed save is reported to the caller");
    assert.ok(err.cause, "with the underlying error attached");
    return true;
  });
  chmodSync(dir, 0o700);
  assert.deepEqual(createStore(file).get("history"), ["keep me"], "the last good state is still on disk");
  assert.deepEqual(readdirSync(dir), ["state.json"], "no half-written temp file was left behind");
}

{
  const file = fresh();
  const store = createStore(file);
  const big = Array.from({ length: 5000 }, (_, i) => ({ title: `track ${i}`, artist: "x".repeat(50) }));
  for (let i = 0; i < 20; i++) {
    store.set("history", big.slice(0, 250 * (i + 1)));
    const onDisk = JSON.parse(readFileSync(file, "utf8"));
    assert.equal(onDisk.history.length, 250 * (i + 1));
  }
  assert.deepEqual(readdirSync(join(file, "..")), ["state.json"], "no temp files survive a normal write");
}

{
  const file = fresh();
  const a = createStore(file);
  const b = createStore(file);
  a.set("afk", { u1: { reason: "tea" } });
  b.set("played", { u2: { title: "Blue Veins" } });
  const reloaded = createStore(file);
  assert.deepEqual(reloaded.get("played"), { u2: { title: "Blue Veins" } });
  assert.equal(reloaded.get("afk"), undefined, "b had no afk key, so its write is the file - documented last-writer-wins");
}

rmSync(root, { recursive: true, force: true });
console.log("store: all cases pass");
