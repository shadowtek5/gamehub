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
    date: "2026-07-20",
    title: "Know your library: stats, a backlog and a dice roll",
    body: "A new Your stats page (in the menu; on mobile from your profile) shows how much you've actually played — total playtime, games and systems, an activity heatmap of the last year, your most-played games, and time broken down by system, with a year picker once you've played across more than one. Underneath it, \"Ready to finish\" surfaces the shortest games you haven't completed yet, using HowLongToBeat times, so a huge library stops being paralysing. Can't decide at all? Hit \"Surprise me\" for a random pick you can filter to browser-playable, never-played, or games under a couple of hours — then roll again until something sticks. The Review & clean up page also gained a Health tab: metadata, box art, hashing and DAT-verification coverage across the whole library at a glance, with the problem counts one click away.",
    art: "automation",
  },
  {
    date: "2026-07-19",
    title: "Find and clean up problem games",
    body: "A new Review & clean up page (admins, from the library) puts the games that need attention in one place, split into two tabs. Unidentified lists games GameHub couldn't match — the hash isn't in any DAT, or it matched but the stored name differs — as art cards you can scan quickly. Duplicates has two views: exact byte-identical copies (same file hash) and the same game held as multiple region/revision copies, each grouped with the copy we suggest keeping so you can hide the rest in one click. Select any games to handle them in bulk — hide (reversible), re-scrape, or delete from disk — or open a game's ⚙ menu to re-identify it. On desktop/TV and the mobile app.",
    art: "automation",
  },
  {
    date: "2026-07-19",
    title: "See downloads as they happen",
    body: "Scraping a game's metadata or picking artwork from the ⚙ menu now shows a progress modal instead of a silent wait. Metadata scrapes show each step as it runs (matching the game, then fetching details and media); artwork downloads show a real filling bar with the size as it streams in. It's there for both game and system cogs, on desktop/TV and the mobile app, so you always know it's working and how far along it is.",
    art: "automation",
  },
  {
    date: "2026-07-18",
    title: "Back keeps your place",
    body: "Working through a long list is smoother now. When you open a game and go back, the library (or system) returns to exactly where you were scrolled — and the same for going back from a system to the systems grid. No more being bounced to the top and losing your spot every time. It restores your position even deep into a big list, and works on desktop/TV and the mobile app.",
    art: "automation",
  },
  {
    date: "2026-07-18",
    title: "Distinct icons for every system",
    body: "Each console now has its own real icon out of the box. Where the default square icon used to draw a generic silhouette by hardware type — so the NES, SNES and Genesis all looked the same — every system now ships with a distinct monochrome console glyph bundled in the app, no scraping needed. They're tinted onto each system's brand-colored tile so a fresh library looks polished from the first launch, and cover 97 systems including obscure ones. Any icon you scrape or set yourself still takes over. On desktop/TV and the mobile app.",
    art: "artwork",
  },
  {
    date: "2026-07-18",
    title: "Art-only game hero",
    body: "Have a game whose hero artwork speaks for itself? Open the game's ⚙ menu and pick \"Show hero art only\" to hide the logo and title overlaid on its detail header — leaving just the artwork for a cleaner, more art-forward look. It's a per-game choice (set it on the games you want), applies wherever a game actually has wide hero art, and assetless games still show their title so the header is never blank.",
    art: "artwork",
  },
  {
    date: "2026-07-17",
    title: "Update GameHub from inside GameHub",
    body: "No more rebuilding or re-pulling the Docker image by hand to update. Settings › System › Software updates now checks GitHub for new GameHub releases and installs them for you — or turn on automatic updates and let it check and apply new versions on its own. Prefer to do it yourself? Upload a release .zip and it installs the same way. Every update is verified by SHA-256 before it's applied, your data is never touched, and if a new version fails to start GameHub automatically rolls back to the built-in one — so an update can't leave you stuck. You can also revert to any earlier installed version at any time. Works on desktop/TV and the mobile app (Docker installs).",
    art: "automation",
  },
  {
    date: "2026-07-16",
    title: "Sign in apps by scanning a code",
    body: "Connecting an app to GameHub is now as easy as Steam's QR login. An app shows a QR code; you scan it on any device where you're already signed in, review what it's asking for, and tap Approve — the app is authenticated, no typing a URL or token. Approvals mint a scoped access token for your account and expire if you don't confirm in a few minutes. Works on desktop/TV and the mobile app.",
    art: "automation",
  },
  {
    date: "2026-07-16",
    title: "Scan to connect an app",
    body: "Creating a personal API token now shows a QR code alongside it. Scan it with a companion or external app and it configures itself automatically — the code carries this server's address and the new access token, so there's no copy-pasting a URL and a long token by hand. The QR appears only once, right when the token is created (the token itself is never stored in the clear). On desktop/TV and the mobile app, under Account › API tokens.",
    art: "automation",
  },
  {
    date: "2026-07-15",
    title: "Every system looks great out of the box",
    body: "Systems now ship with a full set of default artwork — no scraping needed. Each console gets its real logo on a brand-colored gradient across the detail hero and browse card, plus a matching square icon with its console silhouette, all tinted to the system's signature color. The logos are bundled in the app (pulled from open logo sources and your cached art), so a fresh library looks polished from the first launch. Your cover-art mosaics still lead for systems with games; the branded default fills in everywhere else. On desktop/TV and the mobile app. Any art you scrape or set yourself still takes over.",
    art: "artwork",
  },
  {
    date: "2026-07-15",
    title: "Cheats — with a huge built-in code library",
    body: "Games now have a Cheats section (and a Cheats page in the in-game Quick Menu). Pick from a built-in library of over half a million ready-made cheats covering ~14,000 games — search by name and add with one tap — or type your own Game Genie / raw codes. Toggle each one on or off; changes in the Quick Menu apply instantly, and codes set on the game page kick in the next time you launch. On desktop/TV and the mobile app.",
    art: "artwork",
  },
  {
    date: "2026-07-15",
    title: "A cleaner in-game menu",
    body: "The in-game Quick Menu is now the single place for everything. EmulatorJS's default control bar is hidden for a clean, distraction-free screen — one subtle menu button (or Select+Start / F1) opens the menu, and it holds it all: pause, fast-forward, save/load states, screenshot, record, mute, fullscreen, cheats, controller layout, restart, exit — plus a new Video filter picker (sharp pixels, smooth, or a CRT look, remembered per game). You can also still set the video filter on the game page.",
    art: "artwork",
  },
  {
    date: "2026-07-15",
    title: "Record clips of your gameplay",
    body: "You can now record video clips while you play. Hit the ● button in the on-screen bar (or \"Record clip\" in the Quick Menu) to start capturing the game, and stop it the same way — a \"REC\" indicator shows while it's rolling, and the clip downloads to your device when you stop. Handy for capturing that perfect run or a weird glitch. (Clips are video-only for now; syncing game audio is on the list.)",
    art: "artwork",
  },
  {
    date: "2026-07-15",
    title: "Faster library — box art now lives locally",
    body: "Library and system pages load a lot faster. GameHub no longer hotlinks cover art live from an external site — every cover is downloaded once and stored locally as a compact WebP (a ~350 KB remote PNG becomes a ~20 KB local thumbnail), so grids paint quickly and don't depend on anyone else's server being up. New games are localized automatically after a scan, and there's a one-time \"Download box art locally\" action under Settings › Storage & maintenance to convert an existing library (it also clears dead cover links to a clean placeholder).",
    art: "artwork",
  },
  {
    date: "2026-07-15",
    title: "An in-game Quick Menu, Steam Deck-style",
    body: "While a game is running you can now pull up a Quick Menu overlay — press Select + Start on a controller, or hit the ☰ button in the on-screen bar. From it you can save a state, load any of your save-state slots (with thumbnails), grab a screenshot, open the controller-layout editor, restart, or exit — without fumbling through the emulator's own menus. It's fully controller-navigable (D-pad to move, A to pick, B to go back). New feature — worth a quick try with your controller.",
    art: "news",
  },
  {
    date: "2026-07-15",
    title: "Message your friends",
    body: "GameHub now has direct messages. A new Messages area (the chat icon in the top bar, or the Message button next to any friend) lets you chat one-on-one with your friends: a conversation list with unread badges on the left, the thread on the right, and a live unread count on the header icon. Messages update as they arrive, opening a conversation marks it read, and it's friends-only. Works on desktop/TV and the mobile app.",
    art: "recommendations",
  },
  {
    date: "2026-07-15",
    title: "Share your controller layouts",
    body: "Perfected a button mapping? You can now share it. The controller-layout editor has a new Share panel: hit Copy code to turn the current layout into a short shareable code, and paste a friend's code into Import to load it in — then Save to keep it. Great for handing a known-good mapping for a fiddly pad or a specific game to someone else, no re-mapping button by button. Works everywhere the layout editor does, on desktop/TV and the mobile app.",
    art: "news",
  },
  {
    date: "2026-07-15",
    title: "Box art that fits every system",
    body: "System cards now size themselves to the actual box art. Instead of a fixed, per-system card shape, each system's grid samples the first game that has art, reads its real proportions, and sizes every card to match — so tall PS1 covers, near-square 3DS keep-cases and wide cartridge labels all fill their cards cleanly with no more cropped edges. It just works, with nothing to configure, on both desktop/TV and the mobile app.",
    art: "artwork",
  },
  {
    date: "2026-07-15",
    title: "Playtime limits and schedules for kids",
    body: "Parental controls got real teeth. A restriction profile (Settings › Age restrictions) can now set a daily play-time limit and an allowed-hours window — say 60 minutes a day, only between 3 PM and 8 PM. When a child on that profile reaches the limit or is outside the allowed hours, they simply can't launch a game, and if they hit the limit mid-session the game saves and exits with a friendly \"time's up\" message. It's all on top of the existing per-profile system and content-rating limits, and applies on desktop/TV and the mobile app.",
    art: "automation",
  },
  {
    date: "2026-07-15",
    title: "Write and read guides for your games",
    body: "Games now have community guides. A new GUIDES tab on the game page (a Guides section on mobile) lets anyone write a walkthrough, tips or strategy and read what others have shared. Browse the list, open a guide to read it in full, and edit or delete your own any time (admins can moderate any). It's plain, no-fuss text — just hit \"Write a guide\". On desktop/TV and the mobile app.",
    art: "news",
  },
  {
    date: "2026-07-15",
    title: "Compatibility ratings — know before you play",
    body: "Playable games now show an emulation compatibility badge, like Steam Deck's Verified/Playable or ProtonDB. On a game's page you'll see a consensus rating — Playable, Runs with issues, or Broken — built from everyone's reports, with a breakdown of the counts. Tell the community how it ran for you (and leave a note about glitches or settings that helped) in a couple of taps. Admins can pin an official rating that overrides the crowd. Shows on desktop/TV and the mobile app.",
    art: "hashing",
  },
  {
    date: "2026-07-15",
    title: "Search everything from one box",
    body: "There's now a universal search palette. Press Ctrl+K (or / on a keyboard), or tap the search icon in the top bar, and start typing — it finds games, systems, collections, friends and app pages all at once, grouped, with keyboard navigation (arrows + Enter). Jump straight to anything without digging through menus. On desktop/TV and the mobile app.",
    art: "news",
  },
  {
    date: "2026-07-15",
    title: "Reviews — say whether a game's worth it",
    body: "Games now have community reviews, Steam-style. On any game there's a new REVIEWS tab (a Reviews section on mobile): give a thumbs up or down and, if you like, write a few words. Everyone's reviews show together with an at-a-glance \"% recommended\" score, and the tab shows that percentage right on the label. You can edit or delete your review any time — one per person per game. Works on desktop/TV and the mobile app.",
    art: "recommendations",
  },
  {
    date: "2026-07-15",
    title: "See what your friends are playing — live",
    body: "Your friends list now shows who's in a game right now. While a friend is playing, their entry gets a green dot and a \"Playing {game}\" line, and they jump to the top of your friends list — tap through straight to the game. It updates as you play (no need to leave a game to broadcast it) and clears itself when you stop. Works on the Friends page on both desktop/TV and the mobile app, and it respects the Invisible status.",
    art: "recommendations",
  },
  {
    date: "2026-07-15",
    title: "Take screenshots while you play",
    body: "GameHub can now grab screenshots straight from the emulator, Steam-style. While a game is running, hit the camera button in the on-screen bar (or press F2) to capture the current frame — it's saved to your personal gallery for that game. Every game page now has a \"Your screenshots\" section (desktop and mobile) with a grid of your captures: click any one for a fullscreen viewer with next/previous, download, and delete. Your shots are private to you, and each game keeps your most recent 100.",
    art: "artwork",
  },
  {
    date: "2026-07-14",
    title: "Dropdowns and menus tidied up",
    body: "A pass over every dropdown and options menu for consistency. Genre lists are now alphabetized (like the language lists already were), the language picker reads in name order instead of by locale code, and the library Sort-by list is reordered for a ROM library (everyday sorts first, achievements last). API tokens now default to a safer least-privilege, 90-day setting — and you can finally set a token's expiry from the mobile app, not just desktop. The mobile game and system options menus were reordered to match desktop (with destructive \"Clean up missing\" isolated at the bottom), Patch ROM is available to non-admins on mobile just like desktop, and the kid-profile age cap now includes an Adults-Only 18+ tier.",
    art: "news",
  },
  {
    date: "2026-07-14",
    title: "Crisp white icons across every menu",
    body: "The menus got a visual cleanup to match Steam Big Picture. Every icon in Settings (both the desktop rail and the mobile list), the Quick Access panel, and the game/system option menus is now a clean white line icon instead of a mixed bag of colorful emoji — so the Language globe, Friends, Sign out, Fetch manual, Patch ROM and the rest all share one consistent look. Same on desktop/TV and the mobile app.",
    art: "artwork",
  },
  {
    date: "2026-07-14",
    title: "Even more desktop tools reach the mobile app",
    body: "A second round of mobile parity, this time for admins and editors. A system's tools sheet (⚙) now lets you Upload ROMs, Manage firmware, edit the per-system controller layout, and export the system for other launchers (gamelist.xml, RetroArch .lpl, and multi-disc .m3u). A game's options sheet gains Fix metadata match, Fetch video snap, Fetch manual, and Patch ROM — and the game page now shows its full activity timeline, where you can post and read comments. And mobile Settings now includes the Age Restrictions panel — restriction profiles and per-system age gating — and lets you assign a restriction profile to a user.",
    art: "mobile",
  },
  {
    date: "2026-07-14",
    title: "The mobile app catches up: save states, achievements, filters, collections",
    body: "A big batch of desktop features came to the mobile app. On a game's page you now get its cloud save states (browse, resume, delete), your RetroAchievements progress and badges, and the per-game controller-layout editor — all previously desktop-only. The mobile library gains the play-status filters (Favorites, Playing, Backlog, Beaten, Hidden), the player-mode and region-variant filters, and the % Achievements and Size sorts. And Collections are no longer read-only on your phone: create standard or smart collections, and delete your own, right from the mobile app.",
    art: "mobile",
  },
  {
    date: "2026-07-13",
    title: "Collections now have a list view too",
    body: "Just like the Systems page, the Collections page now has a Grid / List toggle in the top-right (your choice is remembered per device). The list view is a compact one-line-per-collection layout — name, smart/public badges, and game count — that's much quicker to scan when you have a lot of collections. On desktop/TV the same toggle also switches the auto-generated Genres, Developers and Publishers groupings between tiles and lists. Available on the mobile app too.",
    art: "recommendations",
  },
  {
    date: "2026-07-13",
    title: "Read the whole story in What's New",
    body: "The What's New cards on the home page clamp long updates to a few lines. Now, on the desktop/TV interface, tapping a GameHub update or announcement opens it in a modal so you can read the entire message — no more getting cut off mid-sentence. Cards with somewhere to go (a system, a game, an external link) still take you there as before. (On the mobile app, the What's New page already shows the full text.)",
    art: "news",
  },
  {
    date: "2026-07-13",
    title: "Switch language from the profile menu, and a handier profile button",
    body: "You no longer need admin Settings to change your language. The profile menu (the ··· Quick Access panel's account section) now has a Language picker right next to Account and Friends, and on the mobile app it's on your Profile screen — so every user can switch the interface language, not just admins. While we were there: tapping your profile picture in the header now toggles — it takes you to your profile, and tapping it again (once you're there) sends you back to wherever you came from instead of stranding you. Opening the Main Menu or Quick Access (or tapping your avatar) now also closes whatever panel was already open, so you never end up with two overlapping. Works on desktop/TV and mobile.",
    art: "recommendations",
  },
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
