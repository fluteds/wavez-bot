import { get, set } from "../../lib/store.js";

export default {
  name: "afk",
  aliases: ["away", "brb"],
  description: "mark yourself away until you next speak",
  usage: "!afk [reason]",
  execute({ rawArgs, sender, messageId }) {
    const afk = get("afk") ?? {};
    const name = sender.displayName ?? sender.username;
    if (afk[sender.userId]) { delete afk[sender.userId]; set("afk", afk); return `welcome back, ${name}`; }
    afk[sender.userId] = { name, reason: rawArgs || null, messageId };
    set("afk", afk);
    return `${name} is afk${rawArgs ? `: ${rawArgs}` : ""}`;
  },
};
