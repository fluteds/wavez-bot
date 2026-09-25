import assert from "node:assert";
import { mkdtempSync, rmSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { ROLES, isRole, actorRank, targetRank, meetsRole, loadCommands } from "../commands/index.js";
import { WavezBot } from "../lib/bot.js";
import { createStore } from "../lib/store.js";

const COMMANDS = fileURLToPath(new URL("../commands/", import.meta.url));
const INVALID = ["moderator", "owner", "admin", "HOST", "Host", " host", "host ", "", "root", "superuser", "__proto__", "toString", "0", "-1"];
const quiet = () => {
  const real = { warn: console.warn, error: console.error };
  console.warn = () => { }; console.error = () => { };
  return () => { console.warn = real.warn; console.error = real.error; };
};

assert.deepEqual(ROLES, ["user", "resident_dj", "bouncer", "manager", "cohost", "host"], "the authority order is the documented one");
assert.deepEqual(ROLES.map(actorRank), [0, 1, 2, 3, 4, 5], "ranks ascend with authority");
ROLES.forEach((role) => assert.equal(isRole(role), true, `${role} is a role`));
for (const junk of [...INVALID, null, undefined, 42, {}, []]) assert.equal(isRole(junk), false, `${String(junk)} is not a role`);

for (const junk of [...INVALID, null, undefined, 42]) {
  assert.ok(actorRank(junk) < actorRank("user"), `${String(junk)} must not outrank a plain user`);
  assert.ok(targetRank(junk) > targetRank("host"), `${String(junk)} must not be treatable as below the host`);
}

for (const minRole of ROLES)
  for (const role of ROLES)
    assert.equal(meetsRole({ name: "t", minRole }, role), ROLES.indexOf(role) >= ROLES.indexOf(minRole), `${role} vs a ${minRole} gate`);

assert.equal(meetsRole({ minRole: "bouncer" }, "resident_dj"), false, "a resident dj is not a mod");
assert.equal(meetsRole({ minRole: "bouncer" }, "bouncer"), true, "the gate includes the role it names");
assert.equal(meetsRole({ minRole: "manager" }, "bouncer"), false, "a bouncer cannot ban");
assert.equal(meetsRole({ minRole: "manager" }, "cohost"), true);
assert.equal(meetsRole({ minRole: "host" }, "cohost"), false, "a cohost is not the host");

for (const role of [...ROLES, ...INVALID, null, undefined]) {
  assert.equal(meetsRole({ name: "ping" }, role), true, "an ungated command is open");
  assert.equal(meetsRole({ name: "ping", minRole: null }, role), true, "an explicit null gate is open");
  assert.equal(meetsRole({ name: "ping", minRole: undefined }, role), true);
}

{
  const restore = quiet();
  for (const minRole of INVALID.filter((r) => r !== ""))
    for (const role of [...ROLES, null, undefined])
      assert.equal(meetsRole({ name: "danger", minRole }, role), false, `a "${minRole}" gate must refuse ${role} - this is the -1 bug`);
  for (const role of INVALID)
    for (const minRole of ROLES)
      assert.equal(meetsRole({ name: "danger", minRole }, role), false, `"${role}" must not clear a ${minRole} gate`);
  restore();
}

assert.equal(meetsRole({ minRole: "user" }, undefined), true);
assert.equal(meetsRole({ minRole: "bouncer" }, undefined), false);
assert.equal(meetsRole({ minRole: "bouncer" }, null), false);

const { registry, commands } = await loadCommands();
assert.ok(commands.length > 30, `expected the full command set, got ${commands.length}`);
for (const command of commands)
  assert.ok(command.minRole == null || isRole(command.minRole), `${command.name} has minRole "${command.minRole}"`);
for (const [name, minRole] of [["kick", "bouncer"], ["mute", "bouncer"], ["skip", "bouncer"], ["move", "bouncer"], ["lock", "bouncer"], ["remove", "bouncer"], ["ban", "manager"], ["unban", "manager"], ["addcmd", "manager"], ["delcmd", "manager"]])
  assert.equal(registry.get(name).minRole, minRole, `${name} must stay ${minRole}+`);
for (const open of ["ping", "help", "nowplaying", "escort", "bail", "afk"])
  assert.equal(registry.get(open).minRole, undefined, `${open} is meant to be open to everyone`);
for (const command of commands)
  for (const alias of command.aliases ?? [])
    assert.equal(registry.get(alias.toLowerCase()).minRole, command.minRole, `alias ${alias} must share ${command.name}'s gate`);

async function withCommandFile(name, source, check) {
  const path = `${COMMANDS}${name}`;
  writeFileSync(path, source);
  try { await check(); } finally { unlinkSync(path); }
}

await withCommandFile("zz-bad-role.tmp.js", 'export default { name: "zzbadrole", minRole: "moderator", execute: () => "x" };', async () => {
  await assert.rejects(loadCommands(), (err) => {
    assert.match(err.message, /minRole "moderator" is not a role/, "the failure names the bad value");
    assert.match(err.message, /user, resident_dj, bouncer, manager, cohost, host/, "and lists what is valid");
    return true;
  }, "an invalid minRole must stop the load");
});

await withCommandFile("zz-empty-role.tmp.js", 'export default { name: "zzemptyrole", minRole: "", execute: () => "x" };', async () => {
  await assert.rejects(loadCommands(), /minRole "" is not a role/, "an empty gate is not an open gate");
});

await withCommandFile("zz-dupe.tmp.js", 'export default { name: "zzdupe", aliases: ["kick"], execute: () => "x" };', async () => {
  await assert.rejects(loadCommands(), /already registered by kick/, "an alias must not quietly take over a gated command");
});

const makeBot = (config) => new WavezBot({ baseURL: "https://api.wavez.fm", botToken: "test", roomId: "test", config });
{
  const bot = makeBot({ allowPlatformRoles: true, platformRoles: { admin: "manager", ambassador: "bouncer" } });
  assert.equal(bot.effectiveRole({ roomRole: "user", platformRole: "ambassador" }), "bouncer", "an ambassador borrows bouncer");
  assert.equal(bot.effectiveRole({ roomRole: "user", platformRoles: ["subscriber", "admin"] }), "manager", "the highest mapped title wins");
  assert.equal(bot.effectiveRole({ roomRole: "host", platformRole: "ambassador" }), "host", "a room role above the mapping is not demoted");
  assert.equal(bot.effectiveRole({ roomRole: "user", platformRole: "subscriber" }), "user", "an unmapped title is nothing");
  assert.equal(bot.effectiveRole({ roomRole: "user", platformRole: "ADMIN" }), "manager", "titles fold to lower case");
  assert.equal(bot.effectiveRole({ roomRole: "user" }), "user");
  assert.equal(bot.effectiveRole({}), "user", "no role at all is a plain user");

  const restore = quiet();
  const warned = [];
  const realWarn = console.warn;
  console.warn = (msg) => warned.push(String(msg));
  bot.config.platformRoles = { ambassador: "overlord", admin: "" };
  assert.equal(bot.effectiveRole({ roomRole: "user", platformRole: "ambassador" }), "user", "an off-ladder mapping is ignored");
  assert.equal(bot.effectiveRole({ roomRole: "user", platformRole: "admin" }), "user", "so is an empty one");
  assert.ok(warned.some((line) => /overlord/.test(line)), "and it is reported once");

  bot.config.platformRoles = { ambassador: "bouncer" };
  assert.equal(bot.effectiveRole({ roomRole: "moderator", platformRole: "ambassador" }), "moderator", "an unknown room role is left as it is, powerless");
  assert.equal(meetsRole({ name: "kick", minRole: "bouncer" }, bot.effectiveRole({ roomRole: "moderator", platformRole: "ambassador" })), false, "so it cannot moderate");
  console.warn = realWarn;
  restore();
}

{
  const bot = makeBot({ allowPlatformRoles: false, platformRoles: { admin: "manager" } });
  assert.equal(bot.effectiveRole({ roomRole: "user", platformRole: "admin" }), "user", "no borrowed roles when the toggle is off");
}

for (const bad of ["overlord", "", "HOST", 0, null, true, ["host"]])
  assert.throws(() => makeBot({ platformRoles: { admin: bad } }), (err) => /is not a role/.test(err.message) && /platformRoles.admin/.test(err.message), `platformRoles.admin: ${JSON.stringify(bad)} must be refused`);
assert.doesNotThrow(() => makeBot({}), "no mapping at all is fine");
assert.doesNotThrow(() => makeBot({ platformRoles: {} }));
for (const role of ROLES) assert.doesNotThrow(() => makeBot({ platformRoles: { admin: role } }), `${role} is a valid mapping`);

{
  const bot = makeBot({ platformRoles: { ambassador: "bouncer" } });
  for (const [id, role] of [["u", "user"], ["d", "resident_dj"], ["b", "bouncer"], ["m", "manager"], ["c", "cohost"], ["h", "host"], ["x", "moderator"]])
    bot.users.set(id, { userId: id, username: role, displayName: role, role, isBot: false });
  bot.users.set("bot", { userId: "bot", username: "thebot", displayName: "The Bot", role: "user", isBot: true });

  const canAct = (senderRole, targetName) => !bot.resolveTarget({ role: senderRole }, targetName).error;
  for (const senderRole of ROLES)
    for (const targetRole of ROLES)
      assert.equal(canAct(senderRole, targetRole), ROLES.indexOf(targetRole) < ROLES.indexOf(senderRole), `${senderRole} acting on ${targetRole}`);
  assert.equal(canAct("host", "host"), false, "not even the host may act on a peer");
  assert.equal(canAct("bouncer", "moderator"), false, "a role we cannot rank is protected, not exposed");
  assert.equal(canAct("host", "moderator"), false, "protected from everyone, so nobody acts on what they cannot read");
  for (const senderRole of INVALID)
    assert.equal(canAct(senderRole, "user"), false, `a "${senderRole}" sender has no authority over anyone`);
  assert.equal(canAct(undefined, "user"), false, "a plain user cannot moderate a plain user");
  assert.match(bot.resolveTarget({ role: "host" }, '"The Bot"').error, /not happening/, "the bot is off limits");
  assert.match(bot.resolveTarget({ role: "host" }, "ghost").error, /no ghost in the room/);
  assert.match(bot.resolveTarget({ role: "host" }, "").error, /name someone/);
  assert.deepEqual(bot.resolveTarget({ role: "manager" }, "bouncer reason here"), { user: bot.users.get("b"), rest: "reason here" });
}

{
  const file = join(mkdtempSync(join(tmpdir(), "wavez-macros-")), "state.json");
  const store = createStore(file);
  const bot = makeBot({ platformRoles: { ambassador: "bouncer" } });
  bot.store = store;
  bot.registry = registry;
  bot.prefix = "!";
  const sent = [];
  bot.reply = async (content) => { sent.push(content); };

  let id = 0;
  const say = async (content, sender = {}) => {
    sent.length = 0;
    await bot.handleMessage({ content, userId: `u${id++}`, username: "tester", ...sender });
    return sent[0] ?? null;
  };

  store.set("macros", {
    open: { text: "anyone can see this", minRole: null },
    staffsay: { text: "mods only", minRole: "bouncer" },
    bosssay: { text: "managers only", minRole: "manager" },
    legacy: "a bare string from before the gate existed",
    broken: { minRole: null },
    alsobroken: 42,
    nulled: null,
    blank: { text: "   ", minRole: null },
  });

  assert.equal(await say("!open"), "anyone can see this", "an ungated canned reply answers everyone");
  assert.equal(await say("!legacy"), "a bare string from before the gate existed", "a pre-gate entry still answers");
  assert.equal(await say("!staffsay", { roomRole: "user" }), null, "a user does not clear a bouncer gate");
  assert.equal(await say("!staffsay", { roomRole: "resident_dj" }), null);
  assert.equal(await say("!staffsay", { roomRole: "bouncer" }), "mods only", "a bouncer does");
  assert.equal(await say("!staffsay", { roomRole: "host" }), "mods only", "and so does everyone above");
  assert.equal(await say("!bosssay", { roomRole: "bouncer" }), null, "a bouncer does not clear a manager gate");
  assert.equal(await say("!bosssay", { roomRole: "manager" }), "managers only");
  assert.equal(await say("!staffsay", { roomRole: "user", platformRole: "ambassador" }), "mods only", "a borrowed bouncer clears a bouncer gate");
  bot.config.allowPlatformRoles = false;
  assert.equal(await say("!staffsay", { roomRole: "user", platformRole: "ambassador" }), null, "with the toggle off it does not");
  bot.config.allowPlatformRoles = true;

  {
    const restore = quiet();
    store.set("macros", { ...store.get("macros"), rogue: { text: "should never fire", minRole: "moderator" } });
    for (const roomRole of [...ROLES, "moderator", undefined])
      assert.equal(await say("!rogue", { roomRole }), null, `a "moderator" gate must refuse ${roomRole}`);
    for (const trigger of ["broken", "alsobroken", "nulled", "blank"])
      assert.equal(await say(`!${trigger}`, { roomRole: "host" }), null, `${trigger} is malformed and stays silent`);
    restore();
  }

  for (const trigger of ["constructor", "tostring", "valueof", "__proto__", "hasownproperty"])
    assert.equal(await say(`!${trigger}`, { roomRole: "host" }), null, `!${trigger} must not resolve to a prototype member`);

  store.set("macros", { kick: { text: "not the real kick", minRole: null }, ping: { text: "not pong", minRole: null } });
  assert.equal(await say("!ping", { roomRole: "user" }), "pong", "the file command wins the name");
  assert.equal(await say("!kick bouncer", { roomRole: "user" }), null, "and a macro cannot shadow a gated command");

  rmSync(file, { force: true });
}

console.log("roles: all cases pass");
