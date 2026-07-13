// GameHub app news — a hand-maintained changelog surfaced in the home page's
// What's New tab. Newest first. When you ship a notable feature, add an entry at
// the top; keep the date in ISO (YYYY-MM-DD) form. No DB, no build step.

import { NewsItem } from "./types";
import { bannerUrl, variantAccent } from "./banner";

interface AppNewsEntry {
  date: string; // YYYY-MM-DD
  title: string;
  body: string;
  /** banner variant — picks the icon + accent that match the feature */
  art: string;
}

const ENTRIES: AppNewsEntry[] = [
  {
    date: "2026-07-13",
    title: "The home page refreshes itself after a scan or scrape",
    body: "The Home carousels now update on their own the moment a background scan or metadata scrape finishes — newly added games and freshly downloaded artwork appear without a manual reload. If you kick off a scan on an empty library, the welcome screen flips straight to your populated home as soon as it completes. It watches for job completion quietly in the background and only refreshes when something actually finished (and pauses while the tab is hidden). Works on both the desktop/TV interface and the mobile app.",
    art: "automation",
  },
  {
    date: "2026-07-13",
    title: "GameHub now speaks your language",
    body: "The interface is no longer English-only. GameHub now ships in 19 languages: English, Arabic, Chinese, Danish, Dutch, Finnish, French, German, Greek, Italian, Japanese, Korean, Norwegian, Polish, Portuguese, Russian, Serbian, Spanish and Swedish — including full right-to-left layout for Arabic. On your first visit it picks up your browser's preferred language automatically; you can change it any time under Settings › Language (or on your Account / Profile screen), and your choice is saved to your account so it follows you to any device. Coverage runs deep across the app — navigation, menus, library, game pages, settings and more — and anything not yet translated in your language falls back cleanly to English, so you'll never see a blank or a raw label. Translations keep expanding with each update, and adding a language is just dropping in one file, so community translations are welcome.",
    art: "news",
  },
  {
    date: "2026-07-13",
    title: "Curate your own related games",
    body: "On top of everything IGDB pulls in, editors can now hand-pick related games on the RELATED tab. Hit \"Manage related games\", search your library, choose a relationship (Same series, Remake, Remaster, Port, DLC, Mod, or just Related), and link it — the pick shows up in the matching row alongside the IGDB entries, and links inward like any owned game. Relationships are two-way, so linking A to B shows it on both games' pages, and you can remove any custom link from the same panel. Your picks survive re-scrapes (they're stored separately from the IGDB data). Works on desktop and the mobile app.",
    art: "recommendations",
  },
  {
    date: "2026-07-13",
    title: "The RELATED tab now links a game's whole family",
    body: "The game page's RELATED tab pulls far more from IGDB. Beyond DLC and expansions, it now surfaces every relationship a game has: direct sequels and series entries (so Final Fantasy X finally lists Final Fantasy X-2), remakes and remasters, ports, standalone expansions, expanded editions, the bundles a game is included in, and mods/forks — each tagged with its kind. Anything you already own links straight into your library (that \"In library\" match is computed live at page load, so adding a game lights up its badge without re-scraping). Re-scrape a game — or run Backfill metadata (no art) across a system — to fill it in.",
    art: "recommendations",
  },
  {
    date: "2026-07-12",
    title: "Trailers hush the theme music, and Back behaves",
    body: "Two game-page fixes. Playing a trailer or video from a game's Media section now pauses that game's title theme music while it plays, and resumes it when you close the video — no more two soundtracks fighting each other. And Back from a game page now reliably returns to exactly where you came from (the specific system, collection or shelf) instead of occasionally jumping all the way out to the Systems list.",
    art: "news",
  },
  {
    date: "2026-07-12",
    title: "Folder watching now works in Docker",
    body: "\"Watch folders for changes\" wasn't detecting new ROMs when GameHub runs in Docker — bind/volume mounts don't deliver real-time file-change events into the container (a well-known Docker limitation). GameHub now detects when it's running in a container and automatically switches to lightweight polling of your library folders, so dropped-in ROMs get picked up and auto-scanned like they should. Power users on a Linux-native Docker host with a local bind mount can force real-time events back on with GAMEHUB_WATCH_POLL=0.",
    art: "automation",
  },
  {
    date: "2026-07-12",
    title: "Systems page: alphabetical, with a list view",
    body: "The Systems page now lists your consoles alphabetically by their metadata name, and there's a Grid / List toggle in the top-right (your choice is remembered per device) — the list view is a compact one-line-per-system layout that's much quicker to scan when you have a lot of systems. On the mobile app, Systems is now a clean one-line-per-system list showing each console's full name and game count.",
    art: "downloads",
  },
  {
    date: "2026-07-12",
    title: "A dedicated Friends page — with real online status",
    body: "Managing friends moved off the crowded Account screen onto its own page (Account › Friends, or the Friends entry in the ··· menu). It's the full manager in one place: search people by name and send requests, accept or decline incoming requests, cancel ones you sent, and unfriend — now with real presence. Each friend shows an online / away / offline dot, your online friends sort to the top, and there's an \"N online\" count. Presence is driven by actual activity (a heartbeat while you're using GameHub), and it respects the Invisible status. The Account and mobile Profile screens now show a compact Friends card with your friend count, how many are online, and a badge for pending requests that taps through to the page. Same on the mobile app.",
    art: "recommendations",
  },
  {
    date: "2026-07-12",
    title: "Way more badges — and a notification when you earn one",
    body: "Profile badges got a big overhaul. There are now dozens of them across playtime, games played, games beaten, 100%-completion, favorites, collections, ratings and notes you've written, save states, how many different systems you've played, friends, profile comments and years of service — most with multiple tiers that level up as you go. Crucially, badges are now personal (earned from what YOU actually do, not the size of the shared library — admins still get the library-size milestones), and they're saved the moment you earn them, so the header bell now pings you with \"New badge: …\" the instant you unlock one. Each badge also has its own generated artwork in the What's New house style. Everything you'd already earned was granted quietly in the background, so there's no notification flood — only new unlocks ping from here on. Same on the mobile app.",
    art: "recommendations",
  },
  {
    date: "2026-07-12",
    title: "Quick Access menu refresh",
    body: "The \"···\" Quick Access panel got a cleanup and some real utility. It now surfaces your unread notifications up top, shows Resume plus a row of recently-played games, adds a UI-sound volume slider next to the sound toggles, and gains an account section at the bottom with your profile, Friends, and a Sign out button. The old raw controller-debug readout (leftover developer scaffolding) is gone.",
    art: "news",
  },
  {
    date: "2026-07-12",
    title: "Backfill missing metadata without touching your artwork",
    body: "New \"Backfill metadata (no art)\" scrape option — on each system's tools menu (Scrape metadata ›) and in a game's options. It goes through your games and fills only the metadata fields that are still empty (including the new IGDB trailer and related games), never overwriting anything you already have and downloading no artwork. Perfect for pulling in trailers and related content across an already-scraped library without re-fetching every cover. Runs in the background like any scrape, and it's on the mobile app too.",
    art: "hashing",
  },
  {
    date: "2026-07-12",
    title: "Related & similar games — a new tab on the game page",
    body: "When IGDB is enabled as a scraper, game details get a new RELATED tab: a \"More like this\" shelf of similar games, a \"Related games\" shelf of a title's DLC, expansions, remakes, remasters and ports (each tagged), and quick external links (official site, Wikipedia, Steam, subreddit and more) when IGDB has them. The rows are the same drag-scroll box-art shelves as the library, and each card links out to its IGDB page. It fills in on your next scrape (or a per-game re-scrape) and shows on the mobile app too.",
    art: "recommendations",
  },
  {
    date: "2026-07-12",
    title: "Friends — add the people you actually play with",
    body: "GameHub now has real friends. Head to Account, search for someone by name, and send a request; once they accept, you're friends both ways. The Account › Friends area is where you manage it all — find people, accept or decline incoming requests, cancel ones you've sent, and see (or remove) your friends — and incoming requests also show up in the header notification bell. Friends power the social bits of GameHub: the Friends tab on Home and the \"friends who've played\" strips on games now show your actual friends instead of everyone on the server, and the bell's \"someone played\" nudges are friends-only too. Works the same on the mobile app.",
    art: "recommendations",
  },
  {
    date: "2026-07-12",
    title: "Folder watching now works on network shares — and only scans what changed",
    body: "The \"Watch folders for changes\" automation toggle got a real fix. Two problems: it only kicked in after a full server restart, and it relied on OS file-change events that simply don't work when your library lives on a NAS / SMB share (the common setup) — so for most people it quietly did nothing. Now flipping it on or off applies immediately (no restart), and it re-points itself whenever you add or remove a library path or map a new system folder. Under the hood it watches local folders in real time and polls network shares on a light interval — wherever your library is stored. Best of all it's now surgical: dropping a ROM into, say, your Game Boy folder queues a scan of just that system instead of the whole library, and any brand-new games it finds are automatically queued for a metadata + artwork scrape — so a new ROM goes from copied to fully scraped on its own.",
    art: "automation",
  },
  {
    date: "2026-07-12",
    title: "Game trailers in the Media section",
    body: "When IGDB is enabled as a scraper, GameHub now pulls each game's official trailer and adds it to the Media section on the game page — right alongside your screenshots and gameplay video. It shows up as a play tile with the trailer thumbnail; click it to watch the trailer full-screen without leaving GameHub. Same on the mobile app. Trailers fill in on your next scrape (or a per-game re-scrape); games IGDB has no trailer for are simply skipped.",
    art: "artwork",
  },
  {
    date: "2026-07-12",
    title: "Notifications — the header bell is now live",
    body: "The bell in the top bar finally does something. It shows an unread count and opens a feed of things worth knowing: new announcements, incoming friend requests, and a nudge when a friend plays something. Admins also get operational alerts pulled from the Activity Log (a paused scrape, a failed backup, integrity issues) and a heads-up when a newer GameHub image has been published, so you know when it's time to update. Click an item to jump to it, or Mark all read to clear the badge; read state is per-account and syncs across your devices. Same bell on the mobile app's top bar.",
    art: "news",
  },
  {
    date: "2026-07-12",
    title: "Live Activity Log — see what the system is doing, and who did it",
    body: "Admins get a new live Activity Log (in the menu and under Settings › Activity Log) that records system events as they happen: library scans (including newly-detected ROM folders and how many new games each scan found), metadata scrapes, new users and role changes, settings edits, DAT imports, backups, dedupe and cleanup — each stamped with who triggered it. Filter by category (each chip shows its count), watch it update live, expand any row for full detail, and load older entries. Entries auto-expire after 30 days; you can also export the whole log to a JSON file for safekeeping, or clear it (all, or older than a chosen window). Automatic (scheduled) jobs show up too, marked as automatic.",
    art: "automation",
  },
  {
    date: "2026-07-12",
    title: "The full What's New history, on its own page",
    body: "GameHub has shipped so many features that the home page can only show the latest handful. The What's New in GameHub shelf now ends with a View more tile (See all on mobile) that opens a dedicated page listing the entire changelog, grouped by date — so you can catch up on everything that's landed, not just the newest few.",
    art: "news",
  },
  {
    date: "2026-07-12",
    title: "Age Restrictions — reusable kid profiles",
    body: "New Settings › Age Restrictions area: create named profiles (e.g. \"Little kids\", \"Teens\") that limit allowed systems and a maximum content rating (Everyone, E10+, Teen, Mature — mapped across ESRB, PEGI, CERO, USK and more), with an optional switch to also hide unrated games. Assign a profile to any account in Settings › Users, and that account only sees and can open the games its profile permits — everywhere: library, search, shelves, collections, recommendations, the Systems grid, and direct links. Change or clear the assignment anytime; nothing is ever deleted.",
    art: "mobile",
  },
  {
    date: "2026-07-12",
    title: "Rewind in the player",
    body: "You can now enable Rewind for the in-browser player under Settings › Controller › In Game. Turn it on and the emulator buffers recent gameplay so you can scrub backwards with its Rewind control — perfect for tricky jumps. It's off by default and remembered per device, since it uses extra memory and CPU (best left off on lower-powered hardware).",
    art: "automation",
  },
  {
    date: "2026-07-12",
    title: "Your play summary, on your profile",
    body: "Your own profile now has a Play Summary section: total hours, your completion split (beaten / playing / backlog / dropped), your most-played games, time spent per system, and your favourite genres — all drawn from your play history. It only shows on your own profile, and only once you've actually played something.",
    art: "recommendations",
  },
  {
    date: "2026-07-12",
    title: "Video previews on hover",
    body: "Hovering a game in the library now fades in its scraped preview clip right over the box art, BigBox-style. The clip only loads after a brief hover so browsing stays snappy, plays muted and looped, and disappears the moment you move away. Games without a video just show their art as before.",
    art: "artwork",
  },
  {
    date: "2026-07-12",
    title: "1G1R cleanup — one copy per game",
    body: "Settings › Maintenance › Set Integrity has a new \"Same game, different dumps (1G1R)\" tool. It groups the region and revision copies of a game — the near-duplicates the byte-identical detector can't catch because their bytes differ — and suggests which one to keep (a DAT-verified, scraped, region-preferred copy wins). Keep your favorite and hide the rest with one click: hidden copies move to the Hidden tab and can be restored anytime. As always, nothing is deleted from disk.",
    art: "hashing",
  },
  {
    date: "2026-07-12",
    title: "Renamed & moved ROMs keep their artwork",
    body: "Reorganizing or renaming your ROM files no longer loses your scraping. When a scan finds a file at a new name or folder whose size and title match a game whose old file is gone, GameHub now recognizes it as the same game and moves the existing entry — carrying over all its metadata, artwork and play history instead of leaving a blank duplicate. The scan summary reports how many entries were moved.",
    art: "downloads",
  },
  {
    date: "2026-07-12",
    title: "Nintendo Switch scraping fixed",
    body: "Switch collections that name every file with a library index — \"00002 - Mario Kart 8 Deluxe\", \"z0122 - Super Mario Maker 2\" — were failing to scrape because the leading number was left in the game's title, so no provider could match it. The scanner now strips that index (while leaving real titles like \"007 - Agent Under Fire\" and \"2064 - Read Only Memories\" untouched), and existing Switch titles were cleaned up. Re-scrape your Switch system to pull the missing box art and metadata.",
    art: "downloads",
  },
  {
    date: "2026-07-11",
    title: "Set Integrity — verify your whole collection",
    body: "A new Settings › Maintenance › Set Integrity panel checks every hashed ROM against the DAT database and labels it Verified, Bad/hack or Unknown. It also finds byte-identical duplicates and shows how complete each system is versus its full No-Intro/Redump set — with a region preference (default North America) that falls back automatically for Japan-only consoles like the Famicom. The DAT importer now pulls the full No-Intro (cartridges) and Redump (discs) sets, and .zip ROMs are hashed by their inner file so compressed games finally hash-match. Auditing runs in the background and never touches your ROMs.",
    art: "hashing",
  },
  {
    date: "2026-07-11",
    title: "Export to any frontend, plus TheGamesDB",
    body: "Every system's ⚙ menu can now export your library for other launchers: a gamelist.xml for EmulationStation/ES-DE, a RetroArch .lpl playlist, and .m3u playlists for multi-disc games. Added TheGamesDB as a metadata provider (boxart, fanart, clear logos, screenshots), and game revisions like (Rev A) / (v1.1) are now parsed and shown as distinct versions.",
    art: "downloads",
  },
  {
    date: "2026-07-10",
    title: "Automatic backups & an Automation hub",
    body: "New Settings › Automation area to schedule the recurring jobs in one place — set how often the library scan and news feeds refresh, and turn on automated backups that write a .tar (database, saves, firmware) to a folder you choose and keep the newest few. Every task also has a Run-now button.",
    art: "automation",
  },
  {
    date: "2026-07-10",
    title: "One download queue you can watch anywhere",
    body: "Scans and scrapes now run through a single queue — start as many as you like and they line up under Up Next and Scheduled instead of colliding. Downloads is now in the menu on both desktop and mobile, with live per-game progress, provider request limits, and a count badge on the mobile tab. Scheduled tasks like the daily scan and backups show there too.",
    art: "downloads",
  },
  {
    date: "2026-07-10",
    title: "The mobile app grows up",
    body: "Mobile now has game and system artwork pickers, a full Properties editor, a native profile you can view and edit (with searchable background art), a What's New home feed with Recommended shelves, and its own Downloads view with a live activity graph.",
    art: "mobile",
  },
  {
    date: "2026-07-10",
    title: "Artwork, icons and connection fixes",
    body: "Hand-picked box art and system art now transcode to WebP just like scraped art, so storage stays small. The header download indicator shows each system's real scraped icon, and a new ScreenScraper option lets you keep scraping through their occasional TLS certificate lapses.",
    art: "artwork",
  },
  {
    date: "2026-07-09",
    title: "Home page: richer recommendations + a news feed",
    body: "The Recommended tab now curates several shelves — Play Next, Jump Back In, more from your favorite genre, hidden gems and a system deep-dive. What's New adds a news feed covering GameHub updates, library milestones and ROM-hacking news from around the web.",
    art: "recommendations",
  },
  {
    date: "2026-07-06",
    title: "GameHub goes mobile",
    body: "Phones now get a dedicated, touch-first experience at /mobile — the full library, systems, collections, game details and settings, with play support, while the Big Picture desktop layout stays untouched.",
    art: "mobile",
  },
  {
    date: "2026-07-03",
    title: "Faster, smarter library hashing",
    body: "Scans now compute CRC32/MD5/SHA-1 in parallel and match against the No-Intro / Redump / MAME datfiles, skipping files that already have a hash and folder-based systems like the Wii U.",
    art: "hashing",
  },
  {
    date: "2026-06-29",
    title: "Encrypted credentials",
    body: "Metadata-provider and sign-in credentials are now AES-256 encrypted at rest. A unique secret key is generated on first run — back it up from Settings › System, it is deliberately excluded from library backups.",
    art: "security",
  },
  {
    date: "2026-06-24",
    title: "Artwork downloader",
    body: "Pull complete artwork sets per system and watch throughput on a live Steam-style graph on the Downloads page. Only art for the games you actually own is extracted and transcoded to WebP.",
    art: "artwork",
  },
];

function toNewsItem(e: AppNewsEntry, i: number): NewsItem {
  return {
    id: `app:${e.date}:${i}`,
    source: "app" as const,
    category: "GameHub",
    title: e.title,
    body: e.body,
    image: bannerUrl(e.art),
    date: `${e.date}T12:00:00.000Z`,
    accent: variantAccent(e.art),
  };
}

export function getAppNews(limit = 6): NewsItem[] {
  return ENTRIES.slice(0, limit).map(toNewsItem);
}

/** Every changelog entry, newest first — backs the dedicated What's New page. */
export function getAllAppNews(): NewsItem[] {
  return ENTRIES.map(toNewsItem);
}
