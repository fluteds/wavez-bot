const clock = (seconds) => `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, "0")}`;

export default {
  name: "time",
  aliases: ["elapsed", "left"],
  description: "how far into the current track we are",
  usage: "!time",
  async execute({ bot }) {
    const p = (await bot.queue()).playback;
    if (!p?.title) return "nothing playing";
    if (p.remainingSeconds == null) return `${p.title} - no clock on this one`;
    const left = Math.max(0, p.remainingSeconds);
    if (p.durationSeconds == null) return `${clock(left)} left`;
    return `${clock(p.durationSeconds - left)} / ${clock(p.durationSeconds)} (${clock(left)} left)`;
  },
};
