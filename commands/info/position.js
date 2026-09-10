export default {
  name: "position",
  aliases: ["pos", "waittime"],
  description: "where you are in the queue and how long the wait is",
  usage: '!position [user|"display name"]',
  async execute({ bot, rawArgs, sender }) {
    const name = bot.parseTarget(rawArgs).name;
    const target = name ? bot.findUser(name) : sender;
    if (!target) return `no ${name} in the room`;
    const q = await bot.queue();
    const entry = (q.entries ?? []).find((e) => e.internalId === target.userId);
    const subject = target.userId === sender.userId ? "you are" : `${target.displayName ?? target.username} is`;
    if (!entry) return `${subject} not in the queue`;
    if (entry.isCurrentDj) return `${subject} spinning right now`;
    const wait = entry.estimatedWaitMinutes;
    return `${subject} #${entry.position} of ${q.count}${wait != null ? `, about ${wait}m out` : ""}`;
  },
};
