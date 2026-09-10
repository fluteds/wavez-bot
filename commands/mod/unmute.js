import { withReason } from "../index.js";

export default {
  name: "unmute",
  description: "let someone talk again",
  usage: '!unmute <user|"display name"> [reason]',
  minRole: "bouncer",
  cooldown: 5000,
  execute({ bot, rawArgs, sender }) {
    const { user, rest: reason, error } = bot.resolveTarget(sender, rawArgs);
    if (error) return error;
    bot.mod("unmute_user", { targetUserId: user.userId });
    bot.muted.delete(user.userId);
    return withReason(`unmuted ${user.displayName ?? user.username}`, reason);
  },
};
