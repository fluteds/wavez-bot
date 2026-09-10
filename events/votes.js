// Vote counts never appear in REST for a bot token, so cache whatever the socket reports.
export default {
  event: "votes_snapshot",
  handler: (payload, bot) => { bot.votes = payload; },
};
