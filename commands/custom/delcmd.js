import { get, set } from "../../lib/store.js";

export default {
  name: "delcmd",
  aliases: ["delcommand", "forget"],
  description: "drop a canned reply",
  usage: "!delcmd <trigger>",
  minRole: "manager",
  cooldown: 5000,
  execute({ args, prefix }) {
    const trigger = (args[0] ?? "").replace(prefix, "").toLowerCase();
    if (!trigger) return `usage: ${prefix}delcmd <trigger>`;
    const macros = get("macros") ?? {};
    if (!Object.hasOwn(macros, trigger)) return `no ${prefix}${trigger} to forget`;
    delete macros[trigger];
    set("macros", macros);
    return `forgot ${prefix}${trigger}`;
  },
};
