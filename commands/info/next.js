export default {
  name: "next",
  aliases: ["upnext"],
  description: "who is up after the current dj",
  usage: "!next",
  async execute({ bot }) {
    const q = await bot.queue();
    const up = (q.entries ?? []).filter((e) => !e.isCurrentDj);
    if (!up.length) return q.count ? "nobody behind the current dj" : "the queue is empty";
    const names = up.slice(0, 3).map((e) => e.displayName || e.username);
    return `up next: ${names.join(", ")}${up.length > names.length ? ` (+${up.length - names.length} more)` : ""}`;
  },
};
