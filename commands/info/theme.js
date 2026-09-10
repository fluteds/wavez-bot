export default {
  name: "theme",
  aliases: ["genre"],
  description: "what the room is playing tonight",
  usage: "!theme",
  execute({ bot }) {
    return bot.config.theme || "no theme set, play what you like";
  },
};
