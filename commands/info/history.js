import { get } from "../../lib/store.js";

export default {
  name: "history",
  aliases: ["last", "recent"],
  description: "the last few tracks played",
  usage: "!history [count]",
  execute({ args }) {
    const history = get("history") ?? [];
    if (!history.length) return "nothing has finished yet";
    const count = Math.min(Math.max(Number(args[0]) || 3, 1), 5);
    return history.slice(0, count).map((t) => `${t.title ?? "?"}${t.artist ? ` - ${t.artist}` : ""} (${t.name ?? "?"})`).join(" | ");
  },
};
