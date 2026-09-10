import { withReason } from "../index.js";

export default {
  name: "remove",
  aliases: ["rm"],
  description: "pull someone out of the queue",
  usage: '!remove <user|"display name"> [reason]',
  minRole: "bouncer",
  cooldown: 5000,
  async execute({ bot, rawArgs, sender }) {
    const { user, rest: reason, error } = bot.resolveTarget(sender, rawArgs);
    if (error) return error;
    const name = user.displayName ?? user.username;
    const { queueUserIds = [] } = await bot.queue();
    if (!queueUserIds.includes(user.userId)) return `${name} is not in the queue`;
    // remove_from_queue takes no reason field either.
    bot.mod("remove_from_queue", { targetUserId: user.userId });
    return withReason(`removed ${name} from the queue`, reason);
  },
};
