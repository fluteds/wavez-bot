export default {
  name: "votes",
  aliases: ["woots"],
  description: "votes on the current track",
  usage: "!votes",
  execute({ bot }) {
    const v = bot.votes;
    return v ? `${v.woots ?? 0} woots, ${v.grabs ?? 0} grabs, ${v.mehs ?? 0} mehs` : "no votes counted yet";
  },
};
