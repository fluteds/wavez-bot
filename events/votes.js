export default {
  event: "votes_snapshot",
  handler: (payload, bot) => { bot.votes = payload; },
};
