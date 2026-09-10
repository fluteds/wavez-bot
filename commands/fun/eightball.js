const ANSWERS = ["yes", "no", "definitely", "not a chance", "ask again later", "i wouldn't", "obviously", "doubt it"];

export default {
  name: "8ball",
  aliases: ["eightball"],
  description: "ask the magic 8 ball",
  usage: "!8ball <question>",
  execute({ args, prefix }) {
    if (!args.length) return `usage: ${prefix}8ball <question>`;
    return ANSWERS[Math.floor(Math.random() * ANSWERS.length)];
  },
};
