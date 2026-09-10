import { splitDuration } from "../../lib/duration.js";
import { withReason } from "../index.js";

export default {
  name: "ban",
  description: "ban someone from the room",
  usage: '!ban <user|"display name"> [30m|2h|1d] [reason]',
  minRole: "manager",
  cooldown: 5000,
  execute({ bot, rawArgs, sender }) {
    const { user, rest, error } = bot.resolveTarget(sender, rawArgs);
    if (error) return error;
    const { minutes, label, reason } = splitDuration(rest); // the ban payload counts in minutes
    bot.mod("ban_user", { targetUserId: user.userId, ...(minutes && { duration: minutes }), ...(reason && { reason }) });
    return withReason(`banned ${user.displayName ?? user.username}${label ? ` for ${label}` : ""}`, reason);
  },
};
