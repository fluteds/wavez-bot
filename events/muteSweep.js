// Backs up the server-side mute: anything a muted user posts gets deleted.
export default {
  event: "message_created",
  handler: async (payload, bot) => {
    if (payload.botId || !payload.id || !bot.isMuted(payload.userId)) return;
    try {
      await bot.api.roomBot.deleteMessage(bot.roomId, payload.id);
    } catch (err) {
      console.error("mute sweep failed:", err.message);
    }
  },
};
