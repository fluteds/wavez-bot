export default {
  name: "ping",
  aliases: ["pong"],
  description: "check the bot is alive",
  usage: "!ping",
  cooldown: 5000,
  execute: () => "pong",
};
