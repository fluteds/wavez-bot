import { withReason } from "../index.js";

export default {
  name: "lock",
  aliases: ["unlock"],
  description: "lock or unlock the queue",
  usage: "!lock [reason] | !unlock [reason]",
  minRole: "bouncer",
  cooldown: 5000,
  async execute({ api, bot, message, prefix, rawArgs }) {
    const queueLocked = !message.slice(prefix.length).toLowerCase().startsWith("unlock");
    try {
      await api.roomBot.updateSettings(bot.roomId, { queueLocked });
      return withReason(`queue ${queueLocked ? "locked" : "unlocked"}`, rawArgs);
    } catch (err) {
      return `lock failed: ${err.message}`;
    }
  },
};
