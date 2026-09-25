import { actorRank } from "../index.js";

export default {
  name: "mods",
  aliases: ["staff"],
  description: "who can moderate the room",
  usage: "!mods",
  execute({ bot }) {
    const staff = [...bot.users.values()].filter((u) => !u.isBot && actorRank(u.role) >= actorRank("bouncer"));
    if (!staff.length) return "no mods seen yet";
    staff.sort((a, b) => actorRank(b.role) - actorRank(a.role));
    return staff.map((u) => `${u.displayName ?? u.username} (${u.role})`).join(", ");
  },
};
