export default {
  name: "choose",
  aliases: ["pick", "either"],
  description: "pick one of your options",
  usage: "!choose a | b | c",
  execute({ rawArgs, prefix }) {
    const separator = rawArgs.includes("|") ? /\s*\|\s*/ : /\s*,\s*/;
    const options = rawArgs.split(separator).map((o) => o.trim()).filter(Boolean);
    if (options.length < 2) return `usage: ${prefix}choose a | b | c`;
    return options[Math.floor(Math.random() * options.length)];
  },
};
