export default {
  name: "djs",
  aliases: ["lineup", "booth"],
  description: "the whole queue in order",
  usage: "!djs",
  async execute({ bot }) {
    const entries = (await bot.queue()).entries ?? [];
    if (!entries.length) return "the queue is empty";
    const shown = entries.slice(0, 8).map((e) => `${e.isCurrentDj ? "now" : e.position}. ${e.displayName || e.username}`);
    return `${shown.join(", ")}${entries.length > shown.length ? ` (+${entries.length - shown.length} more)` : ""}`;
  },
};
