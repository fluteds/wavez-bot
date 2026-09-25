import { createApiClient, createRoomBotRealtimeClient } from "@wavezfm/api";
import { loadCommands, onCooldown, meetsRole, isRole, actorRank, targetRank, ROLES } from "../commands/index.js";
import { loadEvents } from "../events/index.js";
import { get, set } from "./store.js";

if (typeof process.loadEnvFile !== "function" || typeof WebSocket !== "function") throw new Error(`Node >=22 required, running ${process.version}. Run \`nvm install 22\`, or use a newer node already on PATH.`);

const MAX_CONTENT = 255;
const MAX_CHUNKS = 4;

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

export const fill = (template, values) => Object.entries(values).reduce((text, [key, value]) => text.replaceAll(`{${key}}`, value), template);

export class WavezBot {
  constructor({ baseURL, botToken, roomId, config = {}, store = { get, set } }) {
    this.store = store;
    this.baseURL = baseURL;
    this.roomId = roomId;
    this.config = config;
    this.api = createApiClient({ baseURL, roomBotToken: botToken, locale: config.locale ?? "en-US", headers: { "Accept-Language": config.locale ?? "en-US" } });
    this.rt = createRoomBotRealtimeClient({ baseURL, botToken, roomId });
    this.startedAt = Date.now();
    this.state = null;
    this.prefix = "!";
    this.votes = null;
    this.users = new Map();
    this.muted = new Map();
    this.nowPlaying = null;
    this.unknownRoles = new Set();
    this.checkRoleConfig();
  }

  checkRoleConfig() {
    for (const [title, mapped] of Object.entries(this.config.platformRoles ?? {}))
      if (!isRole(mapped)) throw new Error(`config.platformRoles.${title}: "${mapped}" is not a role. Use one of: ${ROLES.join(", ")}`);
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
    if (this.config.startup) await this.reply(fill(this.config.startup, { name: data.bot.name, prefix: this.prefix })).catch((err) => console.error("startup message failed:", err.message));
    return this;
  }

  stop() {
    this.rt.disconnect();
  }

  async reply(content, to = null) {
    const mode = to ? this.config.replyMode ?? "none" : "none";
    if (mode === "mention") content = `@${to.sender.username ?? to.sender.displayName} ${content}`;
    const replyTo = mode === "reply" && to.messageId ? { id: to.messageId } : undefined;
    let sent;
    for (const chunk of chunks(content)) sent = await this.api.roomBot.sendMessage(this.roomId, { content: chunk, replyTo });
    return sent;
  }

  async queue() {
    const { data } = await this.api.roomBot.getQueueStatus(this.roomId);
    return data;
  }

  effectiveRole(source) {
    const roomRole = source.roomRole ?? source.role ?? "user";
    if (this.config.allowPlatformRoles === false) return roomRole;
    if (!isRole(roomRole)) { this.reportUnknownRole(roomRole); return roomRole; }
    const map = this.config.platformRoles ?? {};
    const held = source.platformRoles ?? (source.platformRole ? [source.platformRole] : []);
    return held.reduce((best, title) => {
      const mapped = map[String(title).toLowerCase()];
      if (mapped != null && !isRole(mapped)) this.reportUnknownRole(mapped);
      return isRole(mapped) && actorRank(mapped) > actorRank(best) ? mapped : best;
    }, roomRole);
  }

  reportUnknownRole(role) {
    if (this.unknownRoles.has(role)) return;
    this.unknownRoles.add(role);
    console.warn(`unknown role "${role}": treated as no authority, and as untouchable by moderation. Add it to ROLES in commands/index.js if it is real.`);
  }

  trackUser(user) {
    const userId = String(user?.userId ?? user?.user_id ?? user?.id ?? "");
    if (!userId) return;
    const displayName = user.displayName ?? user.display_name ?? user.username ?? null;
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

  parseTarget(rawArgs) {
    const text = String(rawArgs ?? "").trim();
    const quoted = text.match(/^@?["'](.+?)["']\s*(.*)$/);
    if (quoted) return { name: quoted[1], rest: quoted[2].trim() };
    const [name = "", ...rest] = text.split(/\s+/);
    return { name: name.replace(/^@/, ""), rest: rest.join(" ") };
  }

  resolveTarget(sender, rawArgs) {
    const { name, rest } = this.parseTarget(rawArgs);
    if (!name) return { error: "name someone" };
    const user = this.findUser(name);
    if (!user) return { error: `no ${name} in the room` };
    if (user.isBot) return { error: "not happening" };
    if (targetRank(user.role) >= actorRank(sender.role ?? "user"))
      return { error: `${user.displayName ?? user.username} outranks you` };
    return { user, rest };
  }

  isMuted(userId) {
    const until = this.muted.get(String(userId));
    if (until == null) return false;
    if (until > Date.now()) return true;
    this.muted.delete(String(userId));
    return false;
  }

  mod(event, payload = {}) {
    this.rt.send(event, { roomId: this.roomId, ...payload });
  }

  async handleMessage(payload) {
    const content = String(payload.content ?? "");
    if (payload.botId || !content.startsWith(this.prefix)) return;
    const [trigger, ...args] = content.slice(this.prefix.length).trim().split(/\s+/);
    const command = this.registry.get(trigger.toLowerCase());
    const macros = this.store.get("macros") ?? {};
    const macro = command || !Object.hasOwn(macros, trigger.toLowerCase()) ? null : macros[trigger.toLowerCase()];
    if (!command && !macro) return;

    const sender = {
      userId: payload.userId,
      username: payload.username,
      displayName: payload.displayUsername ?? payload.username,
      role: this.effectiveRole(payload),
    };
    const to = { sender, messageId: payload.id ?? null };

    if (macro) {
      const name = `macro:${trigger.toLowerCase()}`;
      const entry = typeof macro === "string" ? { text: macro, minRole: null } : macro;
      if (!entry || typeof entry.text !== "string" || !entry.text.trim()) { console.error(`${name} is malformed in data/state.json, ignoring it`); return; }
      if (!meetsRole({ name, minRole: entry.minRole }, sender.role)) return;
      if (onCooldown({ name, cooldown: 3000 }, sender.userId ?? sender.username)) return;
      return this.reply(fill(entry.text, { name: sender.displayName ?? sender.username, prefix: this.prefix }), to).catch((err) => console.error(`macro ${trigger} failed:`, err.message));
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
