import { get, set } from "../../lib/store.js";

export default {
  name: "bail",
  aliases: ["hop", "leavequeue"],
  description: "take yourself out of the queue",
  usage: "!bail",
  async execute({ bot, sender }) {
    const { queueUserIds = [] } = await bot.queue();
    if (!queueUserIds.includes(sender.userId)) return "you are not in the queue";
    bot.mod("remove_from_queue", { targetUserId: sender.userId });
    const escorts = get("escorts") ?? {};
    if (escorts[sender.userId]) { delete escorts[sender.userId]; set("escorts", escorts); } // leaving cancels the booking, or it fires on some later play
    return `${sender.displayName ?? sender.username} bailed out of the queue`;
  },
};
