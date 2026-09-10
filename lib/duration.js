// lib/duration.js - "30m", "2h", "1d" or a bare number of minutes, split off the front of a mod command's arguments.

export function parseDuration(token) {
  const match = String(token ?? "").match(/^(\d+)(m|h|d)?$/i);
  if (!match) return null;
  const value = Number(match[1]);
  const unit = (match[2] ?? "m").toLowerCase();
  const minutes = value * (unit === "h" ? 60 : unit === "d" ? 1440 : 1);
  return minutes > 0 ? { minutes, label: `${value}${unit}` } : null;
}

export function splitDuration(text) {
  const [first, ...rest] = String(text ?? "").trim().split(/\s+/).filter(Boolean);
  const duration = parseDuration(first);
  return duration ? { ...duration, reason: rest.join(" ") } : { minutes: null, label: null, reason: [first, ...rest].filter(Boolean).join(" ") };
}

// Rough "how long ago", for !seen and !dupe. Minutes up to an hour, then hours, then days.
export function ago(at) {
  const minutes = Math.round((Date.now() - at) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  return minutes < 1440 ? `${Math.round(minutes / 60)}h ago` : `${Math.round(minutes / 1440)}d ago`;
}
