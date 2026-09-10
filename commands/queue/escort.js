import { get, set } from "../../lib/store.js";

export default {
  name: "escort",
  aliases: ["afterdj", "escortme"],
  description: "leave the queue after your next play, or after a few more",
  usage: "!escort [plays] | !escort off",
  async execute({ bot, args, sender }) {
    const escorts = get("escorts") ?? {};
    const name = sender.displayName ?? sender.username;
    if (/^(off|cancel|stop)$/i.test(args[0] ?? "")) {
      if (!escorts[sender.userId]) return "you are not booked out";
      delete escorts[sender.userId];
      set("escorts", escorts);
      return `${name} is staying after all`;
    }
    const plays = args.length ? Number(args[0]) : 1;
    if (!Number.isInteger(plays) || plays < 1 || plays > 20) return "give me a play count from 1 to 20";
    const { queueUserIds = [], playback } = await bot.queue();
    if (!queueUserIds.includes(sender.userId) && playback?.currentDjId !== sender.userId) return "you are not in the queue";
    escorts[sender.userId] = { name, playsLeft: plays };
    set("escorts", escorts);
    return `${name} leaves the queue after ${plays === 1 ? "the next play" : `${plays} more plays`}`;
  },
};
