import { withReason } from "../index.js";

export default {
  name: "kick",
  description: "remove someone from the room",
  usage: '!kick <user|"display name"> [reason]',
  minRole: "bouncer",
  cooldown: 5000,
  execute({ bot, rawArgs, sender }) {
    const { user, rest: reason, error } = bot.resolveTarget(sender, rawArgs);
    if (error) return error;
    bot.mod("kick_user", { targetUserId: user.userId, ...(reason && { reason }) });
    return withReason(`kicked ${user.displayName ?? user.username}`, reason);
  },
};
