export default {
  name: "uptime",
  description: "how long the bot has been running",
  usage: "!uptime",
  execute({ bot }) {
    const ms = Date.now() - bot.startedAt;
    return `up ${Math.floor(ms / 3600000)}h ${Math.floor(ms / 60000) % 60}m`;
  },
};
