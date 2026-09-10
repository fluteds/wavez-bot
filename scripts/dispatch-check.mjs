// scripts/dispatch-check.mjs - smoke test for command dispatch: connects with the real token but stubs bot.reply, so nothing posts to the room.
// Run: node scripts/dispatch-check.mjs

import { WavezBot, chunks } from "../lib/bot.js";
import muteSweep from "../events/muteSweep.js";
import assert from "node:assert";

process.loadEnvFile(new URL("../.env", import.meta.url));
// chunks() is bypassed by the reply stub below, so it gets checked directly.
assert.deepEqual(chunks("short"), ["short"], "under the limit stays one message");
assert.deepEqual(chunks(""), [], "empty sends nothing");
assert.deepEqual(chunks("a b c", 3), ["a b", "c"], "splits on a space, drops it");
assert.deepEqual(chunks("aaaaa", 3), ["aaa", "aa"], "oversized single word is hard cut");
const long = Array.from({ length: 40 }, (_, i) => `cmd${i}`).join(" ");
assert.ok(chunks(long, 60).every((c) => c.length <= 60), "no chunk exceeds the limit");
assert.equal(chunks(long, 20).length, 4, "runaway reply is capped at 4 messages");
assert.ok(chunks(long, 20).at(-1).endsWith("..."), "a capped reply says it was cut");

const bot = new WavezBot({
  baseURL: process.env.WAVEZ_API_URL ?? "https://api.wavez.fm",
  botToken: process.env.WAVEZ_BOT_TOKEN,
  roomId: process.env.WAVEZ_ROOM_ID,
  config: { locale: "en-US", startup: "{name} is awake - {prefix}help for commands", allowPlatformRoles: true, platformRoles: { admin: "manager", ambassador: "bouncer" } },
});

const sent = [];
bot.reply = async (content) => { sent.push(content); }; // stubbed before start(), so the startup line never reaches the room either
await bot.start();
assert.deepEqual(sent, [`${bot.state.bot.name} is awake - !help for commands`], "start() announces itself, placeholders filled");
bot.votes = { woots: 3, grabs: 1, mehs: 0 };

let n = 0;
const run = async (content, extra = {}) => {
  sent.length = 0;
  await bot.handleMessage({ content, userId: `u${n++}`, username: "tester", roomRole: "user", id: "m1", ...extra });
  return sent[0] ?? null;
};

assert.equal(await run("!ping"), "pong");
assert.equal(await run("!pong"), "pong", "aliases resolve");
assert.equal(await run("!PING"), "pong", "triggers are case-insensitive");
assert.match(await run("!help"), /info: /, "help groups by category");
assert.match(await run("!help np"), /nowplaying/, "help resolves an alias");
assert.match(await run("!user fluted"), /^@fluted/, "profile lookup");
assert.match(await run("!user"), /^usage:/, "missing args explain themselves");
assert.equal(await run(`!user ${bot.state.bot.name}`), `no profile for ${bot.state.bot.name}`, "a bot account has no profile, and says so rather than going quiet");
assert.match(await run("!roll 2 3"), /rolled [23] \(2-3\)/, "roll honours a range");
assert.equal(await run("!votes"), "3 woots, 1 grabs, 0 mehs");
for (const quiet of ["!nope", "hello", "!", "!!ping"]) assert.equal(await run(quiet), null, `${quiet} stays silent`);

// Fun: deterministic where it can be, shape-checked where it cannot.
assert.match(await run("!coin"), /^(heads|tails)$/);
assert.equal(await run("!choose only"), "usage: !choose a | b | c", "one option is not a choice");
assert.equal(await run("!choose a | a"), "a", "pipes split");
assert.equal(await run("!choose tea, tea"), "tea", "commas split when no pipe is given");
assert.equal(await run("!choose a b | a b"), "a b", "options keep their spaces");
assert.match(await run("!vibe"), /^vibe: \S/);

// Track info. The room is live, so assert on shape, not on a particular track.
assert.match(await run("!time"), /nothing playing|no clock on this one|\d+:\d\d/);
assert.match(await run("!next"), /up next: |queue is empty|nobody behind/);
assert.equal(await run("!score"), "100% woots (3/3) - room is glowing", "grabs stay out of the ratio");
bot.votes = { woots: 1, mehs: 3 };
assert.equal(await run("!score"), "25% woots (1/4) - rough crowd");
bot.votes = { woots: 0, mehs: 0 };
assert.equal(await run("!score"), "nobody has voted yet", "an empty tally is not 0%");
bot.votes = null;
assert.equal(await run("!score"), "no votes counted yet");
bot.votes = { woots: 3, grabs: 1, mehs: 0 };

// Mod commands: stub the socket so no real kick/ban leaves the process.
const modCalls = [];
bot.mod = (event, payload) => { modCalls.push([event, payload]); };
bot.users.set("v1", { userId: "v1", username: "victim", displayName: "Victim", role: "user" });
bot.users.set("h1", { userId: "h1", username: "bigcheese", displayName: "Big Cheese", role: "host" });
// A fresh id each time, otherwise the per-user cooldown swallows the second call.
const asBouncer = () => ({ username: "modder", roomRole: "bouncer" });

assert.match(await run("!kick victim", asBouncer()), /^kicked Victim reason: no reason$/);
assert.deepEqual(modCalls.at(-1), ["kick_user", { targetUserId: "v1" }]);
assert.match(await run("!kick @Victim rude", asBouncer()), /^kicked Victim reason: rude/, "@ and a reason both parse");
assert.equal(modCalls.at(-1)[1].reason, "rude");

modCalls.length = 0;
assert.match(await run("!kick bigcheese", asBouncer()), /outranks you/, "a bouncer cannot touch the host");
assert.match(await run("!kick nobody", asBouncer()), /no nobody/, "unknown names are refused");
assert.match(await run("!kick", asBouncer()), /name someone/);
assert.equal(await run("!ban victim", asBouncer()), null, "ban needs manager, bouncer gets silence");
assert.match(await run(`!kick "${bot.state.bot.name}"`, { ...asBouncer(), roomRole: "host" }), /not happening/, "the bot refuses itself");
assert.equal(modCalls.length, 0, "no refused command reached the socket");

bot.users.set("s1", { userId: "s1", username: "slowpoke", displayName: "Slow Poke", role: "user" });
assert.match(await run('!kick "Slow Poke" spam', asBouncer()), /^kicked Slow Poke reason: spam/, "quoted display names resolve");
assert.deepEqual(modCalls.at(-1), ["kick_user", { targetUserId: "s1", reason: "spam" }]);
assert.match(await run("!skip", asBouncer()), /^skipped reason: no reason$/);
assert.deepEqual(modCalls.at(-1), ["skip", undefined]);

// Durations: minutes on the wire for ban, milliseconds for mute.
const asManager = () => ({ username: "boss", roomRole: "manager" });
assert.match(await run("!ban victim 2h spamming", asManager()), /^banned Victim for 2h reason: spamming/);
assert.deepEqual(modCalls.at(-1), ["ban_user", { targetUserId: "v1", duration: 120, reason: "spamming" }]);
assert.match(await run("!ban victim just because", asManager()), /^banned Victim reason: just because/, "a reason alone is not a duration");
assert.equal(modCalls.at(-1)[1].duration, undefined);
assert.match(await run("!mute victim 30m", asBouncer()), /^muted Victim for 30m reason: no reason/);
assert.equal(modCalls.at(-1)[1].durationMs, 1_800_000);
assert.equal(bot.isMuted("v1"), true, "the sweep knows about the mute");
assert.match(await run("!unmute victim", asBouncer()), /^unmuted Victim reason: no reason/);
assert.equal(bot.isMuted("v1"), false);
assert.match(await run("!mute victim", asBouncer()), /^muted Victim reason: no reason$/, "no duration means until unmuted");
assert.equal(modCalls.at(-1)[1].durationMs, undefined);
bot.muted.clear();

// The mute sweep, with the delete stubbed so no real message is touched.
const deleted = [];
bot.api.roomBot.deleteMessage = async (roomId, messageId) => { deleted.push(messageId); };
bot.muted.set("v1", Date.now() + 60_000);
await muteSweep.handler({ id: "m9", userId: "v1" }, bot);
await muteSweep.handler({ id: "m10", userId: "v1", botId: "b1" }, bot);
await muteSweep.handler({ id: "m11", userId: "s1" }, bot);
assert.deepEqual(deleted, ["m9"], "only a muted human's message is deleted");
bot.muted.set("v1", Date.now() - 1);
await muteSweep.handler({ id: "m12", userId: "v1" }, bot);
assert.deepEqual(deleted, ["m9"], "an expired mute stops sweeping");
bot.muted.clear();

// Queue control. The room is live, so !remove only reports; nothing is sent unless queued.
assert.match(await run("!move victim 3", asBouncer()), /^moved Victim to 3 reason: no reason$/);
assert.deepEqual(modCalls.at(-1), ["reorder_queue", { targetUserId: "v1", toPosition: 2 }]);
assert.match(await run("!move victim 0", asBouncer()), /position must be 1/);
assert.match(await run("!remove victim", asBouncer()), /not in the queue/);

// Reasons: on the wire where the server takes one, in the reply everywhere else.
assert.match(await run("!move victim 2 stop hogging", asBouncer()), /^moved Victim to 2 reason: stop hogging$/);
assert.match(await run("!skip too long", asBouncer()), /^skipped reason: too long$/);
assert.match(await run("!skip", asBouncer()), /^skipped reason: no reason$/, "an unstated reason says so");
assert.match(await run("!mute victim 15m yelling", asBouncer()), /^muted Victim for 15m reason: yelling$/);
assert.equal(modCalls.at(-1)[1].reason, undefined, "mute_user carries no reason field");
assert.match(await run("!mute victim yelling", asBouncer()), /^muted Victim reason: yelling$/, "a reason without a duration");
assert.match(await run("!unmute victim calmed down", asBouncer()), /^unmuted Victim reason: calmed down$/);
assert.match(await run('!kick "Slow Poke" way too slow', asBouncer()), /^kicked Slow Poke reason: way too slow$/);
assert.equal(modCalls.at(-1)[1].reason, "way too slow", "kick_user does carry one");
bot.muted.clear();

// Room social. bot.users is already seeded with a host and a plain user by the mod checks above.
assert.match(await run("!mods"), /Big Cheese \(host\)/, "staff are listed, highest role first");
assert.doesNotMatch(await run("!mods"), /Victim/, "a plain user is not staff");

// Queue position. Nobody in this check is queued, so the miss path is the one that is live.
assert.match(await run("!position victim"), /^Victim is not in the queue$/);
assert.match(await run("!position nobody"), /^no nobody in the room$/);
assert.match(await run("!position"), /you are |no  in the room/, "no argument means the sender");

// AFK round-trip, including the clear that fires when the afk user next speaks.
const { get: getState, set: setState } = await import("../lib/store.js");
setState("afk", {}); // the store is a real file, so a previous run must not decide this one
const activity = (await import("../events/activity.js")).default;
assert.equal(await run("!afk making tea", { userId: "afk1", username: "sleepy" }), "sleepy is afk: making tea");
assert.equal(getState("afk").afk1.reason, "making tea");
activity.handler({ userId: "afk1", id: "m1" }, bot);
assert.ok(getState("afk").afk1, "the message that set the flag does not clear it");
activity.handler({ userId: "afk1", id: "later" }, bot);
assert.equal(getState("afk").afk1, undefined, "the next message clears it");
assert.equal(await run("!afk", { userId: "afk2", username: "sleepy" }), "sleepy is afk", "a reason is optional");
assert.match(await run("!users"), /afk: sleepy/, "!users surfaces who is away");
// Toggling back goes straight at the module: a second !afk from one user inside 3s is eaten by the cooldown.
const afkCommand = (await import("../commands/info/afk.js")).default;
assert.equal(afkCommand.execute({ rawArgs: "", sender: { userId: "afk2", username: "sleepy" }, messageId: "m2" }), "welcome back, sleepy", "!afk toggles back");
assert.doesNotMatch(await run("!users"), /afk:/, "and drops out of !users");

// Guards: same user twice inside the cooldown, and the bot's own messages.
await bot.handleMessage({ content: "!ping", userId: "cd", username: "t" });
assert.equal(await run("!ping", { userId: "cd" }), null, "per-user cooldown holds");
assert.equal(await run("!ping", { botId: "b1" }), null, "bot ignores itself");

// Track changes. room_state_snapshot is the only signal, so a repeat trackId must be ignored.
const trackChanged = (await import("../events/trackChanged.js")).default;
setState("played", {});
setState("escorts", {});
bot.nowPlaying = null;
const snapshot = (trackId, djId, title) => ({ playback: { trackId, djId, djUsername: "spinner", djDisplayUsername: "Spinner", title, artist: "Someone" } });
modCalls.length = 0;
trackChanged.handler(snapshot("t1", "dj1", "First"), bot);
assert.equal(bot.nowPlaying.trackId, "t1", "the first snapshot is adopted");
assert.deepEqual(getState("played"), {}, "nothing finished on our watch yet, so nothing is recorded");
trackChanged.handler(snapshot("t1", "dj1", "First"), bot);
assert.deepEqual(getState("played"), {}, "a repeat trackId is not a track change");
trackChanged.handler(snapshot("t2", "dj2", "Second"), bot);
assert.equal(getState("played").dj1.title, "First", "the dj who just finished is credited, not the new one");
assert.equal(bot.nowPlaying.trackId, "t2");

// Escort: counts down completed plays, then pulls them out of the queue.
sent.length = 0;
setState("escorts", { dj2: { name: "Spinner", playsLeft: 2 } });
trackChanged.handler(snapshot("t3", "dj3", "Third"), bot);
assert.equal(getState("escorts").dj2.playsLeft, 1, "one play down, still queued");
assert.equal(modCalls.length, 0, "nothing sent while plays remain");
setState("escorts", { dj3: { name: "Spinner", playsLeft: 1 } });
trackChanged.handler(snapshot("t4", "dj4", "Fourth"), bot);
assert.deepEqual(modCalls.at(-1), ["remove_from_queue", { targetUserId: "dj3" }], "the last play triggers the removal");
assert.equal(getState("escorts").dj3, undefined, "the booking is cleared");
assert.deepEqual(sent, ["escorted Spinner out of the queue"]);
trackChanged.handler(snapshot("t5", "dj5", "Fifth"), bot);
assert.equal(modCalls.length, 1, "a cleared booking does not fire twice");

// History, and the two commands that read it. Votes are whatever was cached when the track ended.
setState("history", []);
// The tally standing when the next snapshot lands belongs to the track that just ended, so it is set before the packet that ends it.
bot.votes = { woots: 1, mehs: 4 };
trackChanged.handler(snapshot("t6", "dj6", "Sixth"), bot);
bot.votes = { woots: 5, mehs: 0 };
trackChanged.handler(snapshot("t7", "dj7", "Seventh"), bot);
assert.equal(getState("history").length, 2, "each finished track is logged once");
assert.equal(getState("history")[0].title, "Sixth", "newest first, and it is the track that just ended");
assert.equal(getState("history")[0].woots, 5, "the tally cached when it ended travels with it");
assert.equal(await run("!history"), "Sixth - Someone (Spinner) | Fifth - Someone (Spinner)", "history lists newest first");
assert.equal(await run("!history 1"), "Sixth - Someone (Spinner)", "a count trims it");
assert.equal(await run("!top"), "Sixth - Someone by Spinner - 5 woots, 0 mehs", "net woots wins, not a percentage");
bot.nowPlaying = { trackId: "t6" };
assert.match(await run("!dupe"), /^played .* by Spinner$/, "a repeat is spotted");
bot.nowPlaying = { trackId: "brand-new" };
assert.match(await run("!dupe"), /^first outing/);
bot.nowPlaying = null;
assert.equal(await run("!dupe"), "nothing playing");
setState("history", []);
assert.equal(await run("!history"), "nothing has finished yet");
assert.equal(await run("!top"), "nothing rated yet");
bot.votes = { woots: 3, grabs: 1, mehs: 0 };

// !bail: self-service !remove, no role needed, and it cancels an escort booking on the way out.
modCalls.length = 0;
const realQueue = bot.queue.bind(bot);
bot.queue = async () => ({ queueUserIds: ["bail1"] });
setState("escorts", { bail1: { name: "Bailer", playsLeft: 2 } });
assert.equal(await run("!bail", { userId: "bail1", username: "bailer" }), "bailer bailed out of the queue");
assert.deepEqual(modCalls.at(-1), ["remove_from_queue", { targetUserId: "bail1" }]);
assert.equal(getState("escorts").bail1, undefined, "leaving cancels the booking");
modCalls.length = 0;
assert.equal(await run("!bail", { userId: "notqueued", username: "nope" }), "you are not in the queue");
assert.equal(modCalls.length, 0, "nothing sent for someone who is not queued");
bot.queue = realQueue;
assert.match(await run("!djs"), /queue is empty|(now|\d+)\. /, "the lineup lists positions");

// Config text: absent keys answer rather than going silent.
assert.equal(await run("!rules"), "no rules set");
assert.equal(await run("!theme"), "no theme set, play what you like");
bot.config.rules = ["be decent", "no dupes"];
bot.config.theme = "slow ones";
assert.equal(await run("!rules"), "be decent | no dupes");
assert.equal(await run("!theme"), "slow ones");

// !seen reads both halves.
setState("spoke", { v1: Date.now() - 90 * 60_000 });
setState("played", { v1: { name: "Victim", title: "Blue Veins", artist: "Ash Walker", at: Date.now() - 5 * 60_000 } });
assert.equal(await run("!seen victim"), "Victim: spoke 2h ago, played Blue Veins - Ash Walker 5m ago");
setState("spoke", {});
assert.equal(await run("!seen victim"), "Victim: played Blue Veins - Ash Walker 5m ago", "half the story still answers");
setState("played", {});
assert.equal(await run("!seen victim"), "nothing on Victim yet");
assert.equal(await run("!seen nobody"), "no nobody in the room");
assert.match(await run("!seen"), /^usage: !seen/);

// activity.js records who spoke, on top of clearing afk.
activity.handler({ userId: "talker", id: "m99", content: "hey" }, bot);
assert.ok(getState("spoke").talker, "a chat message is remembered for !seen");
activity.handler({ userId: "talker", id: "m98", botId: "b1" }, bot);

// Welcome message. bot.reply is already stubbed, so nothing reaches the room.
const userJoined = (await import("../events/userJoined.js")).default;
bot.config.welcome = "welcome in, {name} - {prefix}help if you need it";
sent.length = 0;
userJoined.handler({ userId: "new1", username: "newbie", displayName: "New Bie", roomRole: "user" }, bot);
assert.deepEqual(sent, ["welcome in, New Bie - !help if you need it"], "a joiner is greeted, placeholders filled");
userJoined.handler({ userId: "new1", username: "newbie", displayName: "New Bie" }, bot);
assert.equal(sent.length, 1, "a rejoin inside the cooldown is not greeted again");
userJoined.handler({ userId: "bot9", username: "otherbot", bot: true }, bot);
assert.equal(sent.length, 1, "bots are not greeted");
bot.config.welcome = null;
userJoined.handler({ userId: "new2", username: "quiet" }, bot);
assert.equal(sent.length, 1, "no welcome configured means silence");

// Canned replies: manager-gated to write, anyone to fire, and never able to shadow a real command.
setState("macros", {});
assert.match(await run("!addcmd", asManager()), /^usage: !addcmd/);
assert.match(await run("!addcmd fomo", asManager()), /^usage: !addcmd/, "a trigger with no text is not a command");
assert.equal(await run("!addcmd fomo anything", asBouncer()), null, "a bouncer cannot teach it");
assert.equal(await run("!addcmd ping pong pong", asManager()), "!ping is a real command, pick another name");
assert.equal(await run("!addcmd bad!name hello", asManager()), "triggers are 1-20 letters, numbers, - or _");
assert.equal(await run(`!addcmd wall ${"x".repeat(301)}`, asManager()), "keep it under 300 characters");
assert.equal(await run("!addcmd FOMO hey {name}, {prefix}help", asManager()), "added !fomo", "triggers fold to lower case");
assert.equal(getState("macros").fomo.text, "hey {name}, {prefix}help");
assert.equal(getState("macros").fomo.minRole, null, "no trailing role means anyone can fire it");
assert.equal(await run("!fomo", { userId: "m1", username: "tester" }), "hey tester, !help", "placeholders fill on the way out");
assert.equal(await run("!FOMO", { userId: "m2" }), "hey tester, !help", "canned replies are case-insensitive too");
assert.equal(await run("!fomo", { userId: "m2" }), null, "the 3s cooldown applies per user");
assert.equal(await run("!addcmd fomo second go", asManager()), "updated !fomo", "a rewrite is an update, not a new entry");
assert.equal(Object.keys(getState("macros")).length, 1);
assert.match(await run("!help fomo"), /^!fomo - canned reply: second go$/);
assert.match(await run("!help"), /canned: !fomo/, "help lists them under their own heading");
assert.equal(await run("!ping"), "pong", "a file command still wins its own name");
assert.equal(await run("!delcmd fomo", asBouncer()), null, "a bouncer cannot forget it either");
assert.equal(await run("!delcmd !fomo", asManager()), "forgot !fomo", "a typed prefix is tolerated");
assert.equal(await run("!fomo", { userId: "m3" }), null, "and it stops answering");
assert.equal(await run("!delcmd fomo", asManager()), "no !fomo to forget");
assert.match(await run("!delcmd", asManager()), /^usage: !delcmd/);
assert.doesNotMatch(await run("!help"), /canned:/, "the heading goes away with the last one");
setState("macros", {});

// Platform titles mapped onto the room ladder. The room role and the mapped one both count, higher wins.
assert.equal(bot.effectiveRole({ roomRole: "user", platformRole: "ambassador" }), "bouncer", "an ambassador borrows bouncer");
assert.equal(bot.effectiveRole({ roomRole: "user", platformRoles: ["subscriber", "admin"] }), "manager", "the highest mapped title wins");
assert.equal(bot.effectiveRole({ roomRole: "host", platformRole: "ambassador" }), "host", "a room role above the mapping is not demoted");
assert.equal(bot.effectiveRole({ roomRole: "user", platformRole: "subscriber" }), "user", "an unmapped title is nothing");
assert.equal(bot.effectiveRole({ roomRole: "user", platformRole: "ADMIN" }), "manager", "titles fold to lower case");
assert.equal(bot.effectiveRole({ roomRole: "user" }), "user", "no title, no change");
bot.config.platformRoles = { ambassador: "overlord" };
assert.equal(bot.effectiveRole({ roomRole: "user", platformRole: "ambassador" }), "user", "a mapping to a role that is not on the ladder is ignored");
bot.config.platformRoles = { admin: "manager", ambassador: "bouncer" };

// Through dispatch: the mapping is what actually gates a command.
modCalls.length = 0;
assert.match(await run("!kick victim", { username: "amb", roomRole: "user", platformRole: "ambassador" }), /^kicked Victim/, "an ambassador can moderate");
assert.equal(await run("!ban victim", { username: "amb2", roomRole: "user", platformRole: "ambassador" }), null, "but bouncer is where it stops");
assert.match(await run("!addcmd fromadmin hello", { username: "adm", roomRole: "user", platformRole: "admin" }), /^added !fromadmin/, "an admin gets manager");
setState("macros", {});

// The toggle: off means the room role is the only thing that counts.
bot.config.allowPlatformRoles = false;
assert.equal(bot.effectiveRole({ roomRole: "user", platformRole: "admin" }), "user");
assert.equal(await run("!kick victim", { username: "amb3", roomRole: "user", platformRole: "ambassador" }), null, "no borrowed role, no kick");
bot.config.allowPlatformRoles = true;

// Targets get the same treatment, so a plain bouncer cannot kick an ambassador.
bot.users.set("a1", { userId: "a1", username: "amber", displayName: "Amber", role: bot.effectiveRole({ roomRole: "user", platformRole: "ambassador" }) });
assert.match(await run("!kick amber", asBouncer()), /outranks you/, "a peer by mapped role is still a peer");
bot.users.delete("a1");

// A trailing role name gates the canned reply; quotes keep text that happens to end in one.
setState("macros", {});
assert.equal(await run("!addcmd test \"testing text\" manager", asManager()), "added !test for manager and above");
assert.deepEqual(getState("macros").test, { text: "testing text", minRole: "manager" }, "the quotes are stripped, the role is not stored as text");
assert.equal(await run("!test", { userId: "g1", username: "punter", roomRole: "user" }), null, "below the gate, silence");
assert.equal(await run("!test", { userId: "g2", ...asBouncer() }), null, "still below it");
assert.equal(await run("!test", { userId: "g3", ...asManager() }), "testing text", "at the gate it answers");
assert.match(await run("!help test"), /^!test - canned reply: testing text \(manager and above\)$/);
assert.equal(await run("!addcmd shout \"the host\"", asManager()), "added !shout", "a quoted role word stays in the text");
assert.deepEqual(getState("macros").shout, { text: "the host", minRole: null });
assert.equal(await run("!shout", { userId: "g4", username: "punter", roomRole: "user" }), "the host", "and anyone can fire it");
assert.equal(await run("!addcmd bare the host", asManager()), "added !bare for host and above", "unquoted, the last word is read as the gate");
assert.equal(getState("macros").bare.text, "the");
// The platform mapping feeds the same role check, so a borrowed bouncer clears a bouncer gate.
assert.equal(await run("!addcmd staffonly hello bouncer", asManager()), "added !staffonly for bouncer and above");
assert.equal(await run("!staffonly", { userId: "g5", username: "amb", roomRole: "user", platformRole: "ambassador" }), "hello", "an ambassador clears a bouncer gate");
bot.config.allowPlatformRoles = false;
assert.equal(await run("!staffonly", { userId: "g6", username: "amb", roomRole: "user", platformRole: "ambassador" }), null, "with the toggle off it does not");
bot.config.allowPlatformRoles = true;
// Entries written before the gate existed are bare strings and still answer.
setState("macros", { legacy: "still here" });
assert.equal(await run("!legacy", { userId: "g7" }), "still here");
assert.match(await run("!help legacy"), /^!legacy - canned reply: still here$/);
setState("macros", {});

console.log("dispatch checks passed");
bot.stop();
process.exit(0);
