# Wavez Bot

A simple(ish) bot for [Wavez.fm](https://wavez.fm)

## Getting Started

- You need Node 22 or newer (`process.loadEnvFile` and a global `WebSocket`, both missing before 22)
- Generate a room bot token in the room settings
- A room ID which can be found via the following command:

```shell
curl -s "https://api.wavez.fm/rooms/<ROOM_SLUG>"
```

Put both in `.env` (see `.env.example`), then:

```shell
npm install
npm start
```

You might want to run `nvm install 22` if your node versions do not align with the current node your device is running.

`npm run check` connects with the real token but stubs `bot.reply`, so it exercises dispatch without posting to the room.

## Commands

Default prefix is `!`, set by `config/config.json` or the room's own bot settings.

### info

| Command | Aliases | What it does |
| --- | --- | --- |
| `!help [command]` | `commands` | List commands by category, or explain one |
| `!nowplaying` | `np`, `song` | Title, artist, and minutes left |
| `!time` | `elapsed`, `left` | Position in the current track as `1:23 / 4:56` |
| `!score` | `rating` | Woots as a percentage, with a verdict |
| `!votes` | `woots` | Raw woot / grab / meh counts |
| `!dj` | | Who is in the booth |
| `!next` | `upnext` | Next three in the queue |
| `!djs` | `lineup`, `booth` | The whole queue in order, first eight |
| `!queue` | `q`, `wait` | Queue length, lock state, current DJ |
| `!position [user]` | `pos`, `waittime` | Queue spot and estimated wait, yours by default |
| `!users` | `active`, `pop` | Headcount, plus who is AFK |
| `!user <name>` | `whois`, `profile` | Platform title, level, fan count, country |
| `!mods` | `staff` | Everyone bouncer and above the bot has seen |
| `!seen <user>` | `lastseen` | When they last spoke and what they last played |
| `!history [count]` | `last`, `recent` | The last few finished tracks, newest first, up to five |
| `!dupe` | `again`, `heardit` | Whether the current track is in the last 20, and who played it |
| `!top` | `best` | Best received of the last 20, ranked by woots minus mehs |
| `!rules` | `etiquette` | The `rules` line from `config/config.json` |
| `!theme` | `genre` | The `theme` line from `config/config.json` |
| `!afk [reason]` | `away`, `brb` | Mark yourself away; clears when you next speak |
| `!uptime` | | How long the bot has been running |
| `!ping` | `pong` | `pong` |

### fun

| Command | Aliases | What it does |
| --- | --- | --- |
| `!8ball <question>` | `eightball` | Magic 8 ball |
| `!coin` | `flip`, `coinflip` | Heads or tails |
| `!choose a \| b \| c` | `pick`, `either` | Picks one; falls back to commas when no pipe is given |
| `!roll [min] [max]` | `dice`, `random` | Random number, defaults to 1-6 |
| `!vibe` | `mood` | Reads the room's vibe |

### queue

| Command | Aliases | What it does |
| --- | --- | --- |
| `!escort [plays]` | `afterdj`, `escortme` | Leave the queue after your next play; `!escort 3` for three more, `!escort off` to cancel |
| `!bail` | `hop`, `leavequeue` | Take yourself out of the queue now; also cancels an escort booking |

### custom

Canned replies, added from chat and stored in `data/state.json`. Text only, no code: a trigger maps to a string, `{name}` fills in whoever typed it and `{prefix}` the prefix. They are capped at 50 with 300 characters each, share a 3 second per-user cooldown, and cannot take the name of a file command. `!help` lists them under `canned:`.

A trailing role name gates one to that role and above, using the same ladder and the same platform-role mapping as everything else; without one, anyone can fire it.

```
!addcmd test "testing text" manager
```

The quotes are optional and stripped. They matter when the text itself ends in a role name: unquoted, `!addcmd bare the host` reads `host` as the gate and stores `the`, while `!addcmd shout "the host"` stores the lot and gates nothing.

| Command | Aliases | Min role | What it does |
| --- | --- | --- | --- |
| `!addcmd <trigger> <text> [role]` | `addcommand`, `learn` | manager | Teach or rewrite a canned reply, optionally gated to a role |
| `!delcmd <trigger>` | `delcommand`, `forget` | manager | Drop one |

### mod

Every mod command takes an optional trailing reason, which is echoed in the reply and sent on the wire where the server accepts one. Targets can be quoted for display names with spaces: `!kick "Slow Poke" too slow`.

| Command | Aliases | Min role | What it does |
| --- | --- | --- | --- |
| `!skip [reason]` | | bouncer | Skip the current track |
| `!kick <user> [reason]` | | bouncer | Remove from the room |
| `!mute <user> [duration] [reason]` | | bouncer | Mute, optionally for `30m` / `2h` / `1d` |
| `!unmute <user> [reason]` | | bouncer | Lift a mute |
| `!remove <user> [reason]` | `rm` | bouncer | Pull someone out of the queue |
| `!move <user> <position> [reason]` | `mv` | bouncer | Move someone to a queue position (1-based) |
| `!lock` / `!unlock` | `unlock` | bouncer | Lock or unlock the queue; the alias you type picks which |
| `!ban <user> [duration] [reason]` | | manager | Ban, optionally timed |
| `!unban <user> [reason]` | | manager | Lift a ban |

Roles ascend `user < resident_dj < bouncer < manager < cohost < host`. On top of `minRole`, no one can act on the bot, on a peer, or on anyone above them.

Platform-wide titles are a separate field, `platformRole` / `platformRoles`, and mean nothing to that ladder on their own: an admin or ambassador with no room role is a `user` as far as the room is concerned. `platformRoles` in the config maps them onto the ladder, and `allowPlatformRoles` turns the mapping off without deleting it:

```json
"allowPlatformRoles": true,
"platformRoles": { "admin": "manager", "ambassador": "bouncer" }
```

Whichever role is higher wins, so an ambassador who is also the host stays host and nobody is demoted by the mapping. It applies to targets as well as senders, so a plain bouncer cannot kick an ambassador. A title that is not in the map, or one mapped to something that is not on the ladder, is ignored.

The titles are exactly what the API returns, lower-cased. `ambassador` and `subscriber` are confirmed from a live room, and bot accounts come back as `bot`; `admin` is in the default map but has not been seen on a real account here, so check the spelling with `!user <name>` before relying on it, which now prints whatever titles that account holds.

## Configuration

`config/config.json`:

| Key | Default | Meaning |
| --- | --- | --- |
| `prefix` | `"!"` | Command prefix; falls back to the room's bot setting |
| `locale` | `"en-US"` | API error language, which is pt-BR unless set |
| `replyMode` | `"none"` | `"mention"` prefixes `@sender`, `"reply"` threads onto their message |
| `startup` | see file | Posted to chat once the bot is answering; `{name}` is the bot, `null` disables it |
| `welcome` | see file | Greeting on join; `{name}` is the joiner, `null` disables it |
| `rules` | see file | Printed by `!rules`; a string or a list of lines |
| `theme` | `""` | Printed by `!theme`; empty says there is no theme |
| `allowPlatformRoles` | `true` | Whether platform titles map onto room roles at all; `false` means room role only |
| `platformRoles` | `admin`, `ambassador` | Maps a platform title onto the room ladder |

Both templates substitute `{name}` and `{prefix}`. The startup line goes out last, after commands and events are loaded, so it never claims to be ready early; a send failure is logged and does not stop the bot. Joins are greeted at most once per user per 10 minutes, so a flaky connection does not spam the room, and bots are never greeted.

## Adding a command

Drop a file in `commands/<category>/`. The folder name becomes the category in `!help`, and the loader picks it up on next start.

```js
export default {
  name: "hello",
  aliases: ["hi"],
  description: "say hello",
  usage: "!hello",
  cooldown: 3000,
  minRole: "user",
  execute({ bot, api, args, rawArgs, sender, prefix, reply }) {
    return `hello ${sender.displayName}`;
  },
};
```

A returned string is sent as a reply; return nothing to stay silent. `execute` may be async.

The loader runs once at startup, so a new file needs a restart. Canned replies are the only thing that can be added while the bot is running, and they are text, never code.

## Adding an event

Drop a file in `events/`. Several handlers can bind to the same socket packet, which is how `message_created` drives command dispatch, the mute sweep, and the AFK clear at once.

```js
export default {
  event: "user_joined",
  handler: (payload, bot) => { /* ... */ },
};
```

Use `"packet"` to see every packet. There is no `"*"` wildcard.

## Notes

- A bot token cannot read `getJoinPreview` or `getPlaybackHistory`, and never sees vote counts over REST. `bot.queue()` is the only booth view available, and votes are cached from the socket by `events/votes.js`.
- Kick, ban, mute, and skip are socket-only; `bot.mod()` sends them.
- `bot.users` keeps people who have left, on purpose, so you can still ban someone who just walked out. That also means `!mods` lists staff seen recently rather than staff present now, and with `allowPlatformRoles` on it lists anyone whose mapped title reaches bouncer.
- Bot accounts have no public profile, so `!user` on one 404s like an unknown name and answers `no profile for <name>`. Any other API failure still throws and is logged.
- State that outlives a restart lives in `data/state.json` via `lib/store.js`: AFK flags, who last spoke and played, escort bookings, the last 20 finished tracks behind `!history`, `!dupe`, and `!top`, and the canned replies from `!addcmd`.
- There is no track-change packet for a bot token. `room_state_snapshot` is the only signal, and it also arrives on connect and on room setting changes, so [events/trackChanged.js](events/trackChanged.js) treats a new `trackId` as the change. Its `playback` block names the DJ `djId`/`djUsername`, where the REST queue says `currentDjId`/`currentDjUsername`.
- Escort counts plays a DJ *completes*, so running `!escort` mid-track means that track counts. Bookings and play history live in `data/state.json`, so they survive a restart.
- Vote counts arrive only over the socket, so `!score` and `!votes` read empty after a restart until the next vote packet lands. `!top` stores whatever tally was cached when a track ended, which is that track's unless a packet lands out of order.
