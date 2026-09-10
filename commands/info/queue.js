export default {
  name: "queue",
  aliases: ["q", "wait"],
  description: "queue length and who is up",
  usage: "!queue",
  async execute({ bot }) {
    const q = await bot.queue();
    const dj = q.currentDj?.displayName || q.currentDj?.username;
    return `${q.count} in the queue${q.locked ? " (locked)" : ""}${dj ? `, ${dj} up now` : ""}`;
  },
};
