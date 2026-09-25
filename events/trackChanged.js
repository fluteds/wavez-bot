import { get, set } from "../lib/store.js";

export default {
  event: "room_state_snapshot",
  handler: (payload, bot) => {
    const playback = payload.playback;
    if (!playback?.trackId || playback.trackId === bot.nowPlaying?.trackId) return;
    const finished = bot.nowPlaying;
    bot.nowPlaying = {
      trackId: playback.trackId,
      djId: playback.djId ?? null,
      name: playback.djDisplayUsername ?? playback.djUsername ?? null,
      title: playback.title ?? null,
      artist: playback.artist ?? null,
    };
    if (!finished?.djId) return;

    const played = get("played") ?? {};
    played[finished.djId] = { name: finished.name, title: finished.title, artist: finished.artist, at: Date.now() };
    set("played", played);

    set("history", [{ ...finished, at: Date.now(), woots: bot.votes?.woots ?? 0, mehs: bot.votes?.mehs ?? 0 }, ...(get("history") ?? [])].slice(0, 20));

    const escorts = get("escorts") ?? {};
    const booking = escorts[finished.djId];
    if (!booking) return;
    booking.playsLeft -= 1;
    if (booking.playsLeft > 0) return set("escorts", escorts);
    delete escorts[finished.djId];
    set("escorts", escorts);
    bot.mod("remove_from_queue", { targetUserId: finished.djId });
    bot.reply(`escorted ${finished.name ?? "the dj"} out of the queue`).catch((err) => console.error("escort announce failed:", err.message));
  },
};
