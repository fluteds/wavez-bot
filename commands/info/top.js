import { get } from "../../lib/store.js";

// woots minus mehs, not a percentage: a 1/1 track should not outrank a 30/2 one.
const net = (t) => (t.woots ?? 0) - (t.mehs ?? 0);

export default {
  name: "top",
  aliases: ["best"],
  description: "best received track of the last 20",
  usage: "!top",
  execute() {
    const rated = (get("history") ?? []).filter((t) => (t.woots ?? 0) + (t.mehs ?? 0) > 0);
    if (!rated.length) return "nothing rated yet";
    const best = rated.reduce((a, b) => (net(b) > net(a) ? b : a));
    return `${best.title ?? "?"}${best.artist ? ` - ${best.artist}` : ""} by ${best.name ?? "?"} - ${best.woots ?? 0} woots, ${best.mehs ?? 0} mehs`;
  },
};
