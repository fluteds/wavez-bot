export default {
  name: "score",
  aliases: ["rating"],
  description: "how the current track is landing",
  usage: "!score",
  execute({ bot }) {
    const v = bot.votes;
    if (!v) return "no votes counted yet";
    const woots = v.woots ?? 0;
    const total = woots + (v.mehs ?? 0); // grabs are a save, not a vote, so they stay out of the ratio
    if (!total) return "nobody has voted yet";
    const pct = Math.round((woots / total) * 100);
    const verdict = pct >= 90 ? "room is glowing" : pct >= 70 ? "going down well" : pct >= 50 ? "split" : "rough crowd";
    return `${pct}% woots (${woots}/${total}) - ${verdict}`;
  },
};
