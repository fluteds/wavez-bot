export default {
  event: "vote_updated",
  handler: (payload, bot) => { bot.votes = payload.votesSnapshot ?? bot.votes; },
};
