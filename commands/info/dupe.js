import { get } from "../../lib/store.js";
import { ago } from "../../lib/duration.js";

export default {
  name: "dupe",
  aliases: ["again", "heardit"],
  description: "whether the current track has come up before",
  usage: "!dupe",
  execute({ bot }) {
    if (!bot.nowPlaying?.trackId) return "nothing playing";
    const earlier = (get("history") ?? []).find((t) => t.trackId === bot.nowPlaying.trackId);
    return earlier ? `played ${ago(earlier.at)} by ${earlier.name ?? "someone"}` : "first outing in the last 20 tracks";
  },
};
