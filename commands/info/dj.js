export default {
  name: "dj",
  description: "who is in the booth",
  usage: "!dj",
  async execute({ bot }) {
    const q = await bot.queue();
    const name = q.currentDj?.displayName || q.currentDj?.username || q.playback?.currentDjUsername;
    return name ? `${name} is spinning` : "the booth is empty";
  },
};
