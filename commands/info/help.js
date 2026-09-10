import { get } from "../../lib/store.js";

export default {
  name: "help",
  aliases: ["commands"],
  description: "list commands, or explain one",
  usage: "!help [command]",
  execute({ bot, args, prefix }) {
    const [wanted] = args;
    if (wanted) {
      const name = wanted.replace(prefix, "").toLowerCase();
      const cmd = bot.registry.get(name);
      const macro = (get("macros") ?? {})[name];
      const canned = typeof macro === "string" ? { text: macro, minRole: null } : macro;
      if (!cmd) return canned ? `${prefix}${name} - canned reply: ${canned.text}${canned.minRole ? ` (${canned.minRole} and above)` : ""}` : `no such command: ${wanted}`;
      return `${prefix}${cmd.name} - ${cmd.description ?? "no description"}${cmd.usage ? ` | usage: ${cmd.usage}` : ""}`;
    }
    // Grouped by folder, so !help stays readable as commands/ grows.
    const byCategory = Object.groupBy(bot.commands, (c) => c.category);
    const groups = Object.entries(byCategory).map(([cat, cmds]) => `${cat}: ${cmds.map((c) => prefix + c.name).join(" ")}`);
    const macros = Object.keys(get("macros") ?? {});
    if (macros.length) groups.push(`canned: ${macros.map((m) => prefix + m).join(" ")}`);
    return groups.join(" || ");
  },
};
