# Feature designs: Discord Rich Presence, Steam injection, Netplay

Design proposals for three features that are genuinely missing from GameHub but
that each need infrastructure or a companion process **outside** the self-hosted
web app. None of these is a pure in-app change, so they're written up here for a
go/no-go decision rather than built blind. Each section: how it fits GameHub's
architecture, what to build, effort, tradeoffs, and a recommendation.

Context that shapes all three: GameHub is a Next.js app, typically hosted on a
Synology NAS, played in a browser (including the Steam Deck's browser / Game
Mode). Games run client-side in EmulatorJS. There is per-user auth and a friends
model (all users are "friends"). Playtime is already tracked via a 60s heartbeat
(`/api/roms/[id]/heartbeat`).

---

## 1. Discord Rich Presence ("Playing Super Mario Odyssey on GameHub")

### The obstacle
Discord presence is set through the **local Discord desktop client** over an IPC
socket (named pipe `discord-ipc-0`) or the GameSDK — both require a process on
the *same machine as Discord*. A web page cannot reach that socket, and the
GameHub server runs on the NAS, not on the player's PC. So there is no web-only
path to real Rich Presence.

### Options
- **A. Tiny companion app (recommended if we do this).** A ~150-line tray app
  (Node/Rust/Go) the user runs on the PC where they play. It polls
  `GET /api/presence/me` (new endpoint: returns the caller's current game from
  the live heartbeat, or null) every ~15s and forwards it to Discord via
  `discord-rpc`. Ship it as a small download per OS.
  - Server work: one endpoint. Reuse the heartbeat — extend it to stash
    `{ romId, title, platformName, startedAt }` in a short-TTL in-memory map keyed
    by user, and have `/api/presence/me` read it.
  - Client work: the companion (separate repo/release), plus a Discord app
    registration (public client id, safe to embed) and asset uploads for
    per-system icons.
- **B. "Discord activity" / rich embeds via OAuth.** Not equivalent — it can't
  show live "Playing X" the way the native client does. Not worth it.

### Effort
Small server (1 endpoint + presence map, ~half a day). The companion is a
separate small project + packaging + a Discord app registration. Ongoing: none.

### Tradeoffs
Requires users to install and run a background app — friction that only a subset
will accept. It also means maintaining a second distributable.

### Recommendation
**Low priority.** Build the `/api/presence/me` endpoint regardless (it's cheap
and also powers a future "friends are playing right now" home strip). Defer the
companion unless there's real demand — the endpoint is the reusable 80%.

---

## 2. Steam shortcut injection on the Deck (Steam ROM Manager-style)

### The obstacle
Adding non-Steam shortcuts means writing Steam's `shortcuts.vdf` and dropping
artwork into `.../userdata/<id>/config/grid/`. Both live on the **Deck's**
filesystem, under `~/.steam` / `~/.local/share/Steam`. GameHub runs on the NAS,
so it can't write them directly, and Steam must be **closed** while `shortcuts.vdf`
is rewritten or it clobbers the change on exit.

### Design
Split into an export the server already has the data for, plus a small Deck-side
applier.
- **Server: `GET /api/export/steam?systems=…`** — returns a manifest of the
  chosen games: `{ title, romId, platformName, launchUrl, artwork: { grid, hero,
  logo, icon } }`. `launchUrl` opens the game in GameHub (`https://<host>/play/<id>`
  or the game page); artwork URLs point at the already-scraped media. This is a
  natural sibling of the existing gamelist / RetroArch / m3u exporters in
  `src/lib/export.ts`.
- **Deck applier (small script, distributed separately).** A Python/Bash script
  the user runs once on the Deck in Desktop Mode. It fetches the manifest, writes
  entries into `shortcuts.vdf` (each launching Chrome/Chromium in `--kiosk` at the
  GameHub URL, or `xdg-open`), downloads the artwork into the `grid/` folder with
  the correct `<appid>` and `<appid>p/_hero/_logo` naming, and prompts the user to
  close Steam first. Idempotent: re-running updates rather than duplicates.

### Effort
Server export: small (mirrors existing exporters). The Deck applier is the real
work — `shortcuts.vdf` is a binary VDF (needs a small encoder), Steam appid hashing
for grid filenames is fiddly but well-documented, and it needs testing on-device.

### Tradeoffs
Launches route through the browser (kiosk Chromium) rather than a native process,
so it's "GameHub in Big Picture" not a native Steam game. Requires closing Steam
to apply. Deck-only, and needs on-device testing we can't do from the server repo.

### Recommendation
**Medium priority, high wow-factor for Deck users.** Build the
`/api/export/steam` manifest endpoint now (cheap, reuses scraped art, useful even
without the applier). Treat the Deck applier as a follow-up once we can test on
the real Deck at the known tunnel.

---

## 3. Netplay (online co-op via EmulatorJS)

### The obstacle
EmulatorJS ships a netplay mode, but it needs a **signaling/relay server** the
host runs — EmulatorJS's reference implementation is a small Node + Socket.IO
server that brokers rooms and relays input. That's a persistent service, not a
request/response endpoint, so it doesn't fit Next.js API routes cleanly.

### Design
- **Relay service.** Run EmulatorJS's netplay server (Node + Socket.IO) as a
  sidecar — either a second process in the same container (add to the Docker
  image + a supervisor) or a separate small service. Expose it at `/netplay` via
  the existing reverse proxy with WebSocket upgrade.
- **Client wiring in `Emulator.tsx`.** Set `EJS_netplayUrl` to the relay and
  enable `EJS_Buttons.netplay`. Gate it to cores EmulatorJS actually supports for
  netplay (a subset — NES/SNES/GB/GBA/Genesis/arcade, not the heavy 3D cores).
- **Rooms + invites.** Reuse the friends model: a room is keyed by host user +
  romId; an invite is a link/notification to a friend. Optional: list open rooms
  on the game page ("Friend is hosting — Join").
- **Determinism caveat.** Netplay needs both sides on the **same ROM + same core
  build**. Since everyone plays from the same server library that's naturally
  satisfied, but core version pinning matters (pin the EJS CDN version, which we
  already do via `EJS_CDN = .../stable/...`).

### Effort
Largest of the three. Standing up + packaging the relay (Docker/compose changes,
proxy WebSocket config), client wiring (moderate), rooms/invites UI (moderate).
Ongoing: the relay is a service to run and keep healthy.

### Tradeoffs
Real infra to operate. Latency-sensitive; fine on a LAN / good connections, rough
otherwise. Only a subset of cores work. Meaningful surface area to maintain.

### Recommendation
**Lower priority relative to effort.** Best pursued only if multiplayer is a
headline goal. If so, start with the relay sidecar + a single hardcoded "Play with
a friend" room on one well-supported core (e.g. SNES) as a spike before building
the rooms/invites UI.

---

## Summary

| Feature | Fits web app alone? | Effort | Recommendation |
|---|---|---|---|
| Discord Rich Presence | No (needs PC companion) | S server + companion | Build `/api/presence/me`; defer companion |
| Steam injection | No (needs Deck applier) | S server + M applier | Build `/api/export/steam`; applier as Deck follow-up |
| Netplay | No (needs relay service) | L | Only if multiplayer is a headline goal; spike first |

Common thread: for each, the **server-side 20%** (a presence endpoint, a Steam
export manifest) is cheap, reuses data GameHub already has, and is independently
useful. The **client/infra 80%** (companion, Deck applier, relay) is where the
real cost and the testing-outside-this-repo lives. Recommend shipping the
server-side pieces opportunistically and gating the rest on demand.
