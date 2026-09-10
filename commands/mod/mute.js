import { splitDuration } from "../../lib/duration.js";
import { withReason } from "../index.js";

export default {
  name: "mute",
  description: "stop someone talking",
  usage: '!mute <user|"display name"> [30m|2h|1d] [reason]',
  minRole: "bouncer",
  cooldown: 5000,
  execute({ bot, rawArgs, sender }) {
    const { user, rest, error } = bot.resolveTarget(sender, rawArgs);
    if (error) return error;
    const { minutes, label, reason } = splitDuration(rest);
    const ms = minutes ? minutes * 60_000 : 0;
    // mute_user takes no reason field, so it only reaches the room through the reply.
    bot.mod("mute_user", { targetUserId: user.userId, ...(ms && { durationMs: ms }) });
    bot.muted.set(user.userId, ms ? Date.now() + ms : Infinity);
    return withReason(`muted ${user.displayName ?? user.username}${label ? ` for ${label}` : ""}`, reason);
  },
};
