import { get } from "../../lib/store.js";
import { ago } from "../../lib/duration.js";

export default {
  name: "seen",
  aliases: ["lastseen"],
  description: "when someone last spoke and what they last played",
  usage: "!seen <user>",
  execute({ bot, rawArgs, prefix }) {
    const name = bot.parseTarget(rawArgs).name;
    if (!name) return `usage: ${prefix}seen <user>`;
    const user = bot.findUser(name);
    if (!user) return `no ${name} in the room`;
    const spoke = (get("spoke") ?? {})[user.userId];
    const played = (get("played") ?? {})[user.userId];
    const label = user.displayName ?? user.username;
    if (!spoke && !played) return `nothing on ${label} yet`;
    const track = played ? `${played.title}${played.artist ? ` - ${played.artist}` : ""}` : null;
    const bits = [spoke && `spoke ${ago(spoke)}`, played && `played ${track} ${ago(played.at)}`].filter(Boolean);
    return `${label}: ${bits.join(", ")}`;
  },
};
