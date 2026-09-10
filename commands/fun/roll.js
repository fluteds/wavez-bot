export default {
  name: "roll",
  aliases: ["dice", "random"],
  description: "roll a number",
  usage: "!roll [max] | !roll [min] [max]",
  async execute({ args }) {
    const nums = args.map(Number).filter(Number.isFinite);
    const [min, max] = nums.length >= 2 ? nums : [1, nums[0] ?? 6];
    if (min > max || Math.abs(max) > 1_000_000) return "give me a sane range";
    return `rolled ${Math.floor(Math.random() * (max - min + 1)) + min} (${min}-${max})`;
  },
};
