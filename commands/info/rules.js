export default {
  name: "rules",
  aliases: ["etiquette"],
  description: "the room rules",
  usage: "!rules",
  execute({ bot }) {
    const rules = bot.config.rules;
    return (Array.isArray(rules) ? rules.join(" | ") : rules) || "no rules set";
  },
};
