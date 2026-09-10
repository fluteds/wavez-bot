import { withReason } from "../index.js";

export default {
  name: "skip",
  description: "skip the current track",
  usage: "!skip [reason]",
  minRole: "bouncer",
  cooldown: 5000,
  execute({ bot, rawArgs }) {
    bot.mod("skip");
    return withReason("skipped", rawArgs);
  },
};
