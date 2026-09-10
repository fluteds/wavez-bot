export default {
  name: "nowplaying",
  aliases: ["np", "song"],
  description: "what is playing right now",
  usage: "!np",
  async execute({ bot }) {
    const p = (await bot.queue()).playback;
    if (!p?.title) return "nothing playing";
    const left = p.remainingSeconds != null ? ` (${Math.ceil(p.remainingSeconds / 60)}m left)` : "";
    return `now playing: ${p.title}${p.artist ? ` - ${p.artist}` : ""}${left}`;
  },
};
