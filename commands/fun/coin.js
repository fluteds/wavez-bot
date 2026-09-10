export default {
  name: "coin",
  aliases: ["flip", "coinflip"],
  description: "flip a coin",
  usage: "!coin",
  execute: () => (Math.random() < 0.5 ? "heads" : "tails"),
};
