export default {
  event: "message_created",
  handler: (payload, bot) => bot.handleMessage(payload),
};
