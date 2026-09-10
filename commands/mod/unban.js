import { withReason } from "../index.js";

export default {
  name: "unban",
  description: "lift a ban",
  usage: "!unban <user|userId> [reason]",
  minRole: "manager",
  cooldown: 5000,
  async execute({ api, bot, rawArgs }) {
    const { name, rest: reason } = bot.parseTarget(rawArgs);
    if (!name) return "name someone";
    // a banned user may have aged out of the cache, so fall back to a raw id.
    const userId = bot.findUser(name)?.userId ?? name;
    try {
      await api.roomBot.unban(bot.roomId, String(userId));
      return withReason(`unbanned ${name}`, reason);
    } catch (err) {
      return `unban failed: ${err.message}`;
    }
  },
};
