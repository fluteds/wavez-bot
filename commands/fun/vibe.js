const VIBES = ["hazy", "sun through the blinds", "3am rooftop", "rain on the window", "slow drift", "warm static", "last train home", "empty beach at dusk", "dust in the light", "one long exhale", "coffee going cold", "snow outside, lamp on"];

export default {
  name: "vibe",
  aliases: ["mood"],
  description: "read the room's vibe",
  usage: "!vibe",
  execute: () => `vibe: ${VIBES[Math.floor(Math.random() * VIBES.length)]}`,
};
