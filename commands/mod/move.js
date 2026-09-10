import { withReason } from "../index.js";

export default {
  name: "move",
  aliases: ["mv"],
  description: "move someone to a queue position",
  usage: '!move <user|"display name"> <position> [reason]',
  minRole: "bouncer",
  cooldown: 5000,
  execute({ bot, rawArgs, sender }) {
    const { user, rest, error } = bot.resolveTarget(sender, rawArgs);
    if (error) return error;
    const [spot, ...words] = rest.split(/\s+/).filter(Boolean);
    const position = Number(spot);
    if (!Number.isInteger(position) || position < 1) return "position must be 1 or higher";
    bot.mod("reorder_queue", { targetUserId: user.userId, toPosition: position - 1 });
    return withReason(`moved ${user.displayName ?? user.username} to ${position}`, words.join(" "));
  },
};
