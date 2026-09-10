// lib/bot.js - WavezBot core: owns the REST client, the realtime socket, and command dispatch.
// Events under events/ subscribe to the socket; commands under commands/ answer chat.

import { createApiClient, createRoomBotRealtimeClient } from "@wavezfm/api";
import { loadCommands, onCooldown, meetsRole, ROLES } from "../commands/index.js";
import { loadEvents } from "../events/index.js";
import { get } from "./store.js";

// Guards both entrypoints: index.js and scripts/dispatch-check.mjs both import this module before they touch process.loadEnvFile.
if (typeof process.loadEnvFile !== "function" || typeof WebSocket !== "function") throw new Error(`Node >=22 required, running ${process.version}. Run \`nvm install 22\`, or use a newer node already on PATH.`);

// Shared by the startup line and the join greeting: {name} and {prefix} in a config template.
export const fill = (template, values) => Object.entries(values).reduce((text, [key, value]) => text.replaceAll(`{${key}}`, value), template);

export class WavezBot {
  constructor({ baseURL, botToken, roomId, config = {} }) {
    this.baseURL = baseURL;
    this.roomId = roomId;
    this.config = config;
    // Errors come back in pt-BR unless a locale is set.
    this.api = createApiClient({ baseURL, roomBotToken: botToken, locale: config.locale ?? "en-US" });
    this.rt = createRoomBotRealtimeClient({ baseURL, botToken, roomId });
    this.startedAt = Date.now();
    this.state = null;
    this.prefix = "!";
    this.votes = null; // votes reach a bot token over the socket only, so events/votes.js parks them here
    this.users = new Map(); // userId -> user, the only name->id lookup mod commands get
    this.muted = new Map(); // userId -> expiry ms; events/muteSweep.js deletes what slips through
    this.nowPlaying = null; // events/trackChanged.js parks the current track here to spot the next change
  }

  async start() {
    const { data } = await this.api.roomBot.getState(this.roomId);
    this.state = data;
    this.prefix = this.config.prefix ?? data.bot.commandPrefix ?? "!";
    for (const user of data.snapshot?.users ?? []) this.trackUser(user);

    const { registry, commands } = await loadCommands();
    this.registry = registry;
    this.commands = commands;
    await loadEvents(this);

    await this.rt.connect();
    console.log(`${data.bot.name} listening in ${data.room?.name ?? this.roomId} (prefix ${this.prefix})`);
    console.log(`${commands.length} commands: ${commands.map((c) => c.name).join(", ")}`);
    // Says hello last, once everything is actually answering. A failed hello is no reason not to run.
    if (this.config.startup) await this.reply(fill(this.config.startup, { name: data.bot.name, prefix: this.prefix })).catch((err) => console.error("startup message failed:", err.message));
    return this;
  }

  stop() {
    this.rt.disconnect();
  }

  // replyMode: "none" (default), "mention" prefixes @sender, "reply" threads onto their message.
  // `to` is the triggering message; without it (events, timers) the mode never applies.
  reply(content, to = null) {
    const mode = to ? this.config.replyMode ?? "none" : "none";
    if (mode === "mention") content = `@${to.sender.username ?? to.sender.displayName} ${content}`;
    const replyTo = mode === "reply" && to.messageId ? { id: to.messageId } : undefined;
    return this.api.roomBot.sendMessage(this.roomId, { content, replyTo });
  }

  // The queue snapshot is the only booth view a bot token can read; getJoinPreview and
  // getPlaybackHistory both reject it, so every booth command goes through here.
  async queue() {
    const { data } = await this.api.roomBot.getQueueStatus(this.roomId);
    return data;
  }

  // Platform titles (admin, ambassador) ride on their own field and mean nothing to the room ladder,
  // so config.platformRoles maps them onto it and allowPlatformRoles turns the whole thing off.
  // Whichever is higher wins: an ambassador who is also the host stays host.
  effectiveRole(source) {
    const roomRole = source.roomRole ?? source.role ?? "user";
    if (this.config.allowPlatformRoles === false) return roomRole;
    const map = this.config.platformRoles ?? {};
    const held = source.platformRoles ?? (source.platformRole ? [source.platformRole] : []);
    // An unmapped title, or one mapped to a role that is not on the ladder, indexes to -1 and loses.
    return held.reduce((best, title) => {
      const mapped = map[String(title).toLowerCase()];
      return ROLES.indexOf(mapped) > ROLES.indexOf(best) ? mapped : best;
    }, roomRole);
  }

  // Seeded from the room snapshot, topped up by events/userJoined.js. Leavers stay cached
  // on purpose so you can still ban someone who just walked out.
  trackUser(user) {
    const userId = String(user?.userId ?? user?.user_id ?? user?.id ?? "");
    if (!userId) return;
    const displayName = user.displayName ?? user.display_name ?? user.username ?? null;
    // roomRole is the authority; the snapshot's `role` reads "user" even for the host.
    const role = this.effectiveRole(user);
    this.users.set(userId, { userId, username: user.username ?? null, displayName, role, isBot: user.bot === true });
  }

  findUser(target) {
    const name = String(target ?? "").trim().replace(/^@/, "").toLowerCase();
    if (!name) return null;
    for (const user of this.users.values())
      if ((user.username ?? "").toLowerCase() === name || (user.displayName ?? "").toLowerCase() === name) return user;
    return null;
  }

  // Display names hold spaces ("fluted Bot"), so a quoted name beats a whitespace split.
  parseTarget(rawArgs) {
    const text = String(rawArgs ?? "").trim();
    const quoted = text.match(/^@?["'](.+?)["']\s*(.*)$/);
    if (quoted) return { name: quoted[1], rest: quoted[2].trim() };
    const [name = "", ...rest] = text.split(/\s+/);
    return { name: name.replace(/^@/, ""), rest: rest.join(" ") };
  }

  // Every mod command targeting a person goes through here: no acting on the bot, on a peer,
  // or on anyone above you. minRole alone would let a bouncer kick the host.
  resolveTarget(sender, rawArgs) {
    const { name, rest } = this.parseTarget(rawArgs);
    if (!name) return { error: "name someone" };
    const user = this.findUser(name);
    if (!user) return { error: `no ${name} in the room` };
    if (user.isBot) return { error: "not happening" }; // the bot lists itself under bot.id, not actorUserId
    if (ROLES.indexOf(user.role) >= ROLES.indexOf(sender.role ?? "user"))
      return { error: `${user.displayName ?? user.username} outranks you` };
    return { user, rest };
  }

  // The server mute has a latency window, so we also delete anything a muted user
  // still manages to post. Upstream does the same.
  isMuted(userId) {
    const until = this.muted.get(String(userId));
    if (until == null) return false;
    if (until > Date.now()) return true;
    this.muted.delete(String(userId));
    return false;
  }

  // Kick/ban/mute/skip are socket-only; the REST bot namespace has no equivalent.
  mod(event, payload = {}) {
    this.rt.send(event, { roomId: this.roomId, ...payload });
  }

  async handleMessage(payload) {
    const content = String(payload.content ?? "");
    if (payload.botId || !content.startsWith(this.prefix)) return; // never answer ourselves
    const [trigger, ...args] = content.slice(this.prefix.length).trim().split(/\s+/);
    const command = this.registry.get(trigger.toLowerCase());
    // A file command always wins the name; !addcmd refuses a taken one, so this only ever reaches canned replies.
    const macro = command ? null : (get("macros") ?? {})[trigger.toLowerCase()];
    if (!command && !macro) return;

    const sender = {
      userId: payload.userId,
      username: payload.username,
      displayName: payload.displayUsername ?? payload.username,
      role: this.effectiveRole(payload),
    };
    const to = { sender, messageId: payload.id ?? null };

    if (macro) {
      // Entries written before canned replies had a role gate are a bare string.
      const { text, minRole } = typeof macro === "string" ? { text: macro, minRole: null } : macro;
      if (!meetsRole({ minRole }, sender.role)) return;
      if (onCooldown({ name: `macro:${trigger.toLowerCase()}`, cooldown: 3000 }, sender.userId ?? sender.username)) return;
      return this.reply(fill(text, { name: sender.displayName ?? sender.username, prefix: this.prefix }), to).catch((err) => console.error(`macro ${trigger} failed:`, err.message));
    }

    if (!meetsRole(command, sender.role)) return;
    if (onCooldown(command, sender.userId ?? sender.username)) return;
    const ctx = {
      bot: this,
      api: this.api,
      args,
      rawArgs: content.slice(this.prefix.length + trigger.length).trim(),
      message: content,
      messageId: payload.id ?? null,
      sender,
      prefix: this.prefix,
      reply: (text) => this.reply(text, to),
    };

    try {
      const result = await command.execute(ctx);
      if (typeof result === "string" && result) await this.reply(result, to);
    } catch (err) {
      console.error(`${command.name} failed:`, err.message);
    }
  }
}
