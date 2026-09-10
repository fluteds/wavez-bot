import { get, set } from "../../lib/store.js";
import { ROLES } from "../index.js";

const LIMIT = 50;
const VALID = /^[a-z0-9_-]{1,20}$/i;

export default {
  name: "addcmd",
  aliases: ["addcommand", "learn"],
  description: "teach the bot a canned reply",
  usage: "!addcmd <trigger> <text> [role]",
  minRole: "manager",
  cooldown: 5000,
  execute({ bot, rawArgs, prefix }) {
    const [trigger, ...rest] = rawArgs.split(/\s+/);
    if (!trigger || !rest.length) return `usage: ${prefix}addcmd <trigger> <text> [role]`;
    // A trailing role name is the gate. Quote the text to keep one that genuinely ends in "host".
    const minRole = rest.length > 1 && ROLES.includes(rest.at(-1).toLowerCase()) ? rest.pop().toLowerCase() : null;
    const text = rest.join(" ").replace(/^(["'])([\s\S]*)\1$/, "$2").trim();
    if (!text) return `usage: ${prefix}addcmd <trigger> <text> [role]`;
    if (!VALID.test(trigger)) return "triggers are 1-20 letters, numbers, - or _";
    if (bot.registry.has(trigger.toLowerCase())) return `${prefix}${trigger} is a real command, pick another name`;
    if (text.length > 300) return "keep it under 300 characters";
    const macros = get("macros") ?? {};
    const known = Object.hasOwn(macros, trigger.toLowerCase());
    if (!known && Object.keys(macros).length >= LIMIT) return `${LIMIT} custom commands is the lot, delete one first`;
    macros[trigger.toLowerCase()] = { text, minRole };
    set("macros", macros);
    return `${known ? "updated" : "added"} ${prefix}${trigger.toLowerCase()}${minRole ? ` for ${minRole} and above` : ""}`;
  },
};
