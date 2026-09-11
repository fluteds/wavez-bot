// lib/bot.js - WavezBot core: REST client, realtime socket, command dispatch.
// events/ subscribe to the socket, commands/ answer chat.

import { createApiClient, createRoomBotRealtimeClient } from "@wavezfm/api";
import { loadCommands, onCooldown, meetsRole, ROLES } from "../commands/index.js";
import { loadEvents } from "../events/index.js";
import { get } from "./store.js";

// Both entrypoints import this before they touch process.loadEnvFile.
if (typeof process.loadEnvFile !== "function" || typeof WebSocket !== "function") throw new Error(`Node >=22 required, running ${process.version}. Run \`nvm install 22\`, or use a newer node already on PATH.`);

const MAX_CONTENT = 255;
const MAX_CHUNKS = 4;

// Split on a space, hard cut when one word is oversized.
export function chunks(text, max = MAX_CONTENT) {
  const out = [];
  while (text.length > max) {
    const cut = text.lastIndexOf(" ", max);
    out.push(text.slice(0, cut > 0 ? cut : max).trimEnd());
    text = text.slice(cut > 0 ? cut + 1 : max);
  }
  if (text) out.push(text);
  if (out.length > MAX_CHUNKS) { out.length = MAX_CHUNKS; out[MAX_CHUNKS - 1] = out[MAX_CHUNKS - 1].slice(0, max - 3) + "..."; }
  return out;
}

// {name} and {prefix} in a config template: startup line, join greeting.
export const fill = (template, values) => Object.entries(values).reduce((text, [key, value]) => text.replaceAll(`{${key}}`, value), template);

export class WavezBot {
  constructor({ baseURL, botToken, roomId, config = {} }) {
    this.baseURL = baseURL;
    this.roomId = roomId;
    this.config = config;
    // locale only covers SDK messages; server errors are pt-BR without Accept-Language.
    this.api = createApiClient({ baseURL, roomBotToken: botToken, locale: config.locale ?? "en-US", headers: { "Accept-Language": config.locale ?? "en-US" } });
    this.rt = createRoomBotRealtimeClient({ baseURL, botToken, roomId });
    this.startedAt = Date.now();
    this.state = null;
    this.prefix = "!";
    this.votes = null; // socket-only for a bot token, parked by events/votes.js
    this.users = new Map(); // userId -> user, the only name->id lookup there is
    this.muted = new Map(); // userId -> expiry ms, swept by events/muteSweep.js
    this.nowPlaying = null; // current track, so events/trackChanged.js can spot the next
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
    // Hello goes last, once everything answers, and a failed one is not fatal.
    if (this.config.startup) await this.reply(fill(this.config.startup, { name: data.bot.name, prefix: this.prefix })).catch((err) => console.error("startup message failed:", err.message));
    return this;
  }

  stop() {
    this.rt.disconnect();
  }

  // replyMode: none (default), mention prefixes @sender, reply threads onto their message.
  // No `to` (events, timers) means no mode.
  async reply(content, to = null) {
    const mode = to ? this.config.replyMode ?? "none" : "none";
    if (mode === "mention") content = `@${to.sender.username ?? to.sender.displayName} ${content}`;
    const replyTo = mode === "reply" && to.messageId ? { id: to.messageId } : undefined;
    let sent;
    for (const chunk of chunks(content)) sent = await this.api.roomBot.sendMessage(this.roomId, { content: chunk, replyTo });
    return sent;
  }

  // The only booth view a bot token gets: getJoinPreview and getPlaybackHistory reject it.
  async queue() {
    const { data } = await this.api.roomBot.getQueueStatus(this.roomId);
    return data;
  }

  // Platform titles are off the room ladder; config.platformRoles maps them on, allowPlatformRoles turns it off.
  // Higher wins: an ambassador who is also the host stays host.
  effectiveRole(source) {
    const roomRole = source.roomRole ?? source.role ?? "user";
    if (this.config.allowPlatformRoles === false) return roomRole;
    const map = this.config.platformRoles ?? {};
    const held = source.platformRoles ?? (source.platformRole ? [source.platformRole] : []);
    // A title off the ladder indexes to -1 and loses.
    return held.reduce((best, title) => {
      const mapped = map[String(title).toLowerCase()];
      return ROLES.indexOf(mapped) > ROLES.indexOf(best) ? mapped : best;
    }, roomRole);
  }

  // Seeded from the room snapshot, topped up by events/userJoined.js.
  // Leavers stay cached, so you can still ban someone who walked out.
  trackUser(user) {
    const userId = String(user?.userId ?? user?.user_id ?? user?.id ?? "");
    if (!userId) return;
    const displayName = user.displayName ?? user.display_name ?? user.username ?? null;
    // roomRole is the authority; snapshot `role` reads "user" even for the host.
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

  // Display names hold spaces, so a quoted name beats a whitespace split.
  parseTarget(rawArgs) {
    const text = String(rawArgs ?? "").trim();
    const quoted = text.match(/^@?["'](.+?)["']\s*(.*)$/);
    if (quoted) return { name: quoted[1], rest: quoted[2].trim() };
    const [name = "", ...rest] = text.split(/\s+/);
    return { name: name.replace(/^@/, ""), rest: rest.join(" ") };
  }

  // No acting on the bot, on a peer, or on anyone above you.
  // minRole alone would let a bouncer kick the host.
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

  // The server mute lags, so we delete what a muted user still posts.
  // Upstream does the same.
  isMuted(userId) {
    const until = this.muted.get(String(userId));
    if (until == null) return false;
    if (until > Date.now()) return true;
    this.muted.delete(String(userId));
    return false;
  }

  // Kick/ban/mute/skip are socket-only, no REST equivalent.
  mod(event, payload = {}) {
    this.rt.send(event, { roomId: this.roomId, ...payload });
  }

  async handleMessage(payload) {
    const content = String(payload.content ?? "");
    if (payload.botId || !content.startsWith(this.prefix)) return; // never answer ourselves
    const [trigger, ...args] = content.slice(this.prefix.length).trim().split(/\s+/);
    const command = this.registry.get(trigger.toLowerCase());
    // A file command wins the name; !addcmd refuses a taken one.
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
      // Entries from before the role gate are a bare string.
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
