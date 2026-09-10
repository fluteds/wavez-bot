import { get } from "../../lib/store.js";

export default {
  name: "users",
  aliases: ["active", "pop"],
  description: "how many people are in the room",
  usage: "!users",
  async execute({ api, bot }) {
    const { data } = await api.roomBot.getState(bot.roomId);
    const afk = Object.values(get("afk") ?? {}).map((a) => a.name);
    return `${data.room?.activeUsersCount ?? "?"} listening${afk.length ? `, afk: ${afk.join(", ")}` : ""}`;
  },
};
