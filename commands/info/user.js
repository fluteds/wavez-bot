export default {
  name: "user",
  aliases: ["whois", "profile"],
  description: "look up a wavez profile",
  usage: "!user <username>",
  async execute({ api, args, prefix }) {
    const [name] = args;
    if (!name) return `usage: ${prefix}user <username>`;
    const handle = name.replace(/^@/, "");
    // Bot accounts and unknown names both 404. Anything else is a real failure and belongs in the log.
    const u = await api.user.getByUsername(handle).then((r) => r.data).catch((err) => { if (err?.status === 404) return null; throw err; });
    if (!u) return `no profile for ${handle}`;
    const titles = (u.platformRoles ?? [u.platformRole].filter(Boolean)).join("/");
    const bits = [titles, u.level != null && `level ${u.level}`, u.fanCount != null && `${u.fanCount} fans`, u.country].filter(Boolean);
    return `@${u.username}${bits.length ? ` - ${bits.join(", ")}` : ""}`;
  },
};
