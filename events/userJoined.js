import { fill } from "../lib/bot.js";

// A flaky connection rejoins; the room does not need to hear about it twice.
const GREET_COOLDOWN = 10 * 60_000;
const greeted = new Map();

export default {
  event: "user_joined",
  handler: (payload, bot) => {
    bot.trackUser(payload);
    const template = bot.config.welcome;
    if (!template) return; // no welcome in config means no welcome
    const user = bot.users.get(String(payload.userId ?? payload.user_id ?? payload.id ?? ""));
    if (!user || user.isBot) return;
    const now = Date.now();
    if (now - (greeted.get(user.userId) ?? 0) < GREET_COOLDOWN) return;
    greeted.set(user.userId, now);
    bot.reply(fill(template, { name: user.displayName ?? user.username ?? "friend", prefix: bot.prefix })).catch((err) => console.error("welcome failed:", err.message));
  },
};
