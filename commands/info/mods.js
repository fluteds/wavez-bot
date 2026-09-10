import { ROLES } from "../index.js";

export default {
  name: "mods",
  aliases: ["staff"],
  description: "who can moderate the room",
  usage: "!mods",
  execute({ bot }) {
    // bot.users keeps leavers on purpose, so this is who has moderated recently, not who is here now.
    const staff = [...bot.users.values()].filter((u) => !u.isBot && ROLES.indexOf(u.role) >= ROLES.indexOf("bouncer"));
    if (!staff.length) return "no mods seen yet";
    staff.sort((a, b) => ROLES.indexOf(b.role) - ROLES.indexOf(a.role));
    return staff.map((u) => `${u.displayName ?? u.username} (${u.role})`).join(", ");
  },
};
