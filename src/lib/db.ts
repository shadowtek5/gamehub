import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { distance } from "fastest-levenshtein";
import { parseLanguages } from "./language";
import { ratingLevel } from "./ageRating";
import { PLATFORMS, PLATFORMS_SORTED, platformPlayable, platformVendor } from "./platforms";
import { SS_SYSTEM_IDS } from "./providers/ssSystems";
import { ensureSecretKey } from "./secretbox";
import { getDataDir } from "./dataDir";

// Singleton across Next.js HMR reloads
const globalForDb = globalThis as unknown as { __gamehubDb?: Database.Database };

function createDb(): Database.Database {
  const dataDir = getDataDir();
  let db: Database.Database;
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    db = new Database(path.join(dataDir, "gamehub.db"));
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "SQLITE_CANTOPEN" || code === "EACCES" || code === "EPERM") {
      throw new Error(
        `GameHub can't write to its data folder (${dataDir}). In Docker, the ` +
          `mounted volume isn't writable by the app user — set the PUID/PGID ` +
          `environment variables to the owner of the host folder (e.g. your ` +
          `Synology user), or chown the folder. Original error: ${e}`
      );
    }
    throw e;
  }
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  seedSystems(db); // sync the supported-systems manifest into the systems table
  // Generate the credential-encryption key at first boot so it exists from the
  // start (and gets bundled into backups).
  try {
    ensureSecretKey();
  } catch {
    // best-effort — seal/open will lazily create it on first use anyway
  }
  return db;
}

function migrate(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      is_admin INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_settings (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      PRIMARY KEY (user_id, key)
    );

    -- Named age/content-restriction profiles, created once and assigned to
    -- users (users.restriction_profile_id). NULL columns = no limit of that kind.
    CREATE TABLE IF NOT EXISTS restriction_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      allowed_systems TEXT,               -- JSON array of platform slugs; NULL = all systems
      max_rating INTEGER,                 -- min-age cap (e.g. 13 = Teen); NULL = no cap
      hide_unrated INTEGER NOT NULL DEFAULT 0,
      daily_limit_minutes INTEGER,        -- max play minutes per day; NULL = no limit
      allowed_start_hour INTEGER,         -- allowed play window start hour 0-23; NULL = anytime
      allowed_end_hour INTEGER,           -- allowed play window end hour 0-23 (wraps past midnight)
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Per-user, per-day playtime tally (local date), for enforcing daily limits.
    CREATE TABLE IF NOT EXISTS daily_play (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      day TEXT NOT NULL,                  -- YYYY-MM-DD in server-local time
      seconds INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, day)
    );

    CREATE TABLE IF NOT EXISTS roms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT NOT NULL UNIQUE,
      filename TEXT NOT NULL,
      title TEXT NOT NULL,
      sort_title TEXT NOT NULL,
      platform_slug TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      boxart_url TEXT,
      region TEXT,
      added_at TEXT NOT NULL DEFAULT (datetime('now')),
      missing INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_roms_platform ON roms(platform_slug);
    CREATE INDEX IF NOT EXISTS idx_roms_sort ON roms(sort_title);
    -- Library browse always filters missing=0 and orders by sort_title; this
    -- composite covers the count (missing prefix) and the ordered scan, turning
    -- the cold-cache 44k-row COUNT from ~700ms into a compact index scan.
    CREATE INDEX IF NOT EXISTS idx_roms_missing_sort ON roms(missing, sort_title);

    CREATE TABLE IF NOT EXISTS user_roms (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      rom_id INTEGER NOT NULL REFERENCES roms(id) ON DELETE CASCADE,
      favorite INTEGER NOT NULL DEFAULT 0,
      play_status TEXT NOT NULL DEFAULT 'none', -- none | backlog | playing | beaten | dropped
      playtime_seconds INTEGER NOT NULL DEFAULT 0,
      last_played_at TEXT,
      PRIMARY KEY (user_id, rom_id)
    );

    CREATE TABLE IF NOT EXISTS collections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS collection_items (
      collection_id INTEGER NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
      rom_id INTEGER NOT NULL REFERENCES roms(id) ON DELETE CASCADE,
      added_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (collection_id, rom_id)
    );

    CREATE TABLE IF NOT EXISTS save_states (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      rom_id INTEGER NOT NULL REFERENCES roms(id) ON DELETE CASCADE,
      size_bytes INTEGER NOT NULL DEFAULT 0,
      has_screenshot INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS system_folders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform_slug TEXT NOT NULL,
      path TEXT NOT NULL UNIQUE,
      variant TEXT, -- NULL = main library; else 'hacks', 'translations', 'digital', 'cia', …
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS battery_saves (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      rom_id INTEGER NOT NULL REFERENCES roms(id) ON DELETE CASCADE,
      size_bytes INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, rom_id)
    );

    CREATE TABLE IF NOT EXISTS invites (
      token TEXT PRIMARY KEY,
      role TEXT NOT NULL DEFAULT 'viewer',
      created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL,
      used_by INTEGER REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS firmware (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform_slug TEXT NOT NULL,
      filename TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      md5 TEXT NOT NULL,
      sha1 TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(platform_slug, filename)
    );

    CREATE TABLE IF NOT EXISTS api_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_used_at TEXT
    );

    CREATE TABLE IF NOT EXISTS profile_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Per-user activity feed. Art-changing events snapshot the image to
    -- data/activity/<id>.<image_ext> so the entry keeps its picture even after
    -- the game's live artwork changes again.
    CREATE TABLE IF NOT EXISTS activity (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      rom_id INTEGER REFERENCES roms(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      summary TEXT NOT NULL,
      detail TEXT,
      image_ext TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_activity_user ON activity(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_activity_rom ON activity(rom_id, created_at DESC);

    -- Persisted, earned achievement badges (per user, per tier). Badges are
    -- derived from a catalog but STORED here the moment they're earned, so we get
    -- a stable earned_at (drives "you earned a badge" notifications) and XP that
    -- reflects what the user actually did rather than a live recompute. badge_key
    -- encodes the tier (e.g. "marathon:100h") so climbing a tier awards a new row.
    -- name/detail/icon/color/art snapshot the catalog at earn time so old badges
    -- keep their look even if the catalog changes later.
    CREATE TABLE IF NOT EXISTS user_badges (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      badge_key TEXT NOT NULL,
      family TEXT NOT NULL,            -- e.g. "marathon" — collapses tiers in the grid
      name TEXT NOT NULL,
      detail TEXT NOT NULL,
      xp INTEGER NOT NULL DEFAULT 0,
      icon TEXT NOT NULL DEFAULT '',
      color TEXT NOT NULL DEFAULT '#3a4c63',
      art TEXT NOT NULL DEFAULT 'default',
      tier INTEGER NOT NULL DEFAULT 0, -- 0-based tier index within the family
      earned_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, badge_key)
    );
    CREATE INDEX IF NOT EXISTS idx_user_badges_user ON user_badges(user_id, earned_at DESC);

    -- System-wide operational / audit event log (distinct from the per-user,
    -- per-game 'activity' feed above). Backs the admin-only live Activity Log at
    -- /activity. actor_id is nullable + ON DELETE SET NULL so automatic/scheduled
    -- events (no actor) are storable and events outlive a deleted user; actor_name
    -- snapshots the display name so the log still reads correctly afterwards.
    CREATE TABLE IF NOT EXISTS event_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      category TEXT NOT NULL,          -- scan | scrape | user | auth | settings | maintenance | system
      action TEXT NOT NULL,            -- scan.completed, user.created, settings.changed, …
      severity TEXT NOT NULL DEFAULT 'info', -- info | warn | error
      actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      actor_name TEXT,                 -- denormalized snapshot (survives user delete)
      summary TEXT NOT NULL,
      detail TEXT                      -- optional JSON (counts, slug, key, sample titles…)
    );
    CREATE INDEX IF NOT EXISTS idx_event_log_id ON event_log(id DESC);
    CREATE INDEX IF NOT EXISTS idx_event_log_cat ON event_log(category, id DESC);

    -- Admin-authored announcements shown in the home page's What's New feed.
    CREATE TABLE IF NOT EXISTS announcements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      body TEXT NOT NULL DEFAULT '',
      published INTEGER NOT NULL DEFAULT 1,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_announcements_pub ON announcements(published, created_at DESC);

    -- Cache of scraped external RSS/Atom feeds (ROM hacks, translations, …). One
    -- row per feed URL; the items column is the normalized NewsItem JSON, refreshed
    -- on a TTL so the home page reads instantly and never blocks on the network.
    CREATE TABLE IF NOT EXISTS news_cache (
      url TEXT PRIMARY KEY,
      label TEXT,
      fetched_at TEXT,
      ok INTEGER NOT NULL DEFAULT 0,
      error TEXT,
      items TEXT NOT NULL DEFAULT '[]'
    );

    -- Every application-supported console. Seeded from the supported-systems
    -- manifest (PLATFORMS + the ScreenScraper id preset) on startup and on
    -- library updates; scraped metadata, media visibility (show_*), and library
    -- hiding are stored per row. Art files live in data/systems/<id>/.
    CREATE TABLE IF NOT EXISTS systems (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      short_name TEXT,
      vendor TEXT,
      color TEXT,
      ss_id INTEGER,
      ejs_core TEXT,
      manufacturer TEXT,
      system_type TEXT,
      year_start TEXT,
      year_end TEXT,
      media_format TEXT,
      name_jp TEXT,
      alt_names TEXT,
      metadata_source TEXT,
      scraped_at TEXT,
      show_hero INTEGER NOT NULL DEFAULT 1,
      show_logo INTEGER NOT NULL DEFAULT 1,
      show_icon INTEGER NOT NULL DEFAULT 1,
      show_ribbon INTEGER NOT NULL DEFAULT 1,
      logo_dark INTEGER NOT NULL DEFAULT 0,
      hero_source TEXT NOT NULL DEFAULT 'ribbon',
      card_thumb_stale INTEGER NOT NULL DEFAULT 1,
      card_thumb_sig TEXT,
      hero_thumb_sig TEXT,
      box_layout TEXT NOT NULL DEFAULT 'auto',
      box_layout_auto TEXT,
      custom_thumb INTEGER NOT NULL DEFAULT 0,
      custom_covers TEXT,
      hidden INTEGER NOT NULL DEFAULT 0,
      enabled INTEGER NOT NULL DEFAULT 1
    );

    -- Mutual friendships. One row per relationship: the requester sends, the
    -- addressee accepts (status pending -> accepted). Friendship is symmetric, so
    -- direction only matters for a pending request. Unfriend / cancel / decline
    -- all just delete the row; ON DELETE CASCADE cleans up when a user is removed.
    CREATE TABLE IF NOT EXISTS friendships (
      requester_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      addressee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'pending',   -- pending | accepted
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT,
      PRIMARY KEY (requester_id, addressee_id)
    );
    CREATE INDEX IF NOT EXISTS idx_friendships_addressee ON friendships(addressee_id, status);
    CREATE INDEX IF NOT EXISTS idx_friendships_requester ON friendships(requester_id, status);

    -- User-curated related games, on top of the IGDB-derived relationships.
    -- Directional at storage but surfaced on BOTH games (see getCustomRelations),
    -- so linking A→B shows on A and B. kind = a grouping label (Series, Remake, …).
    CREATE TABLE IF NOT EXISTS rom_relations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rom_id INTEGER NOT NULL REFERENCES roms(id) ON DELETE CASCADE,
      related_rom_id INTEGER NOT NULL REFERENCES roms(id) ON DELETE CASCADE,
      kind TEXT NOT NULL DEFAULT 'Related',
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (rom_id, related_rom_id)
    );
    CREATE INDEX IF NOT EXISTS idx_rom_relations_rom ON rom_relations(rom_id);
    CREATE INDEX IF NOT EXISTS idx_rom_relations_related ON rom_relations(related_rom_id);

    -- User-captured in-game screenshots (Steam-style). The PNG lives on disk at
    -- data/screenshots/<user>/<rom>/<id>.<ext>; the row tracks the path + dims.
    CREATE TABLE IF NOT EXISTS screenshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      rom_id INTEGER NOT NULL REFERENCES roms(id) ON DELETE CASCADE,
      image_path TEXT,
      width INTEGER,
      height INTEGER,
      size_bytes INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_screenshots_user_rom ON screenshots(user_id, rom_id);
    CREATE INDEX IF NOT EXISTS idx_screenshots_rom ON screenshots(rom_id);

    -- Community reviews (Steam-style): a thumbs up/down recommendation plus an
    -- optional written blurb, one per user per game, shown to everyone.
    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      rom_id INTEGER NOT NULL REFERENCES roms(id) ON DELETE CASCADE,
      recommended INTEGER NOT NULL,           -- 1 = thumbs up, 0 = thumbs down
      body TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT,
      UNIQUE (user_id, rom_id)
    );
    CREATE INDEX IF NOT EXISTS idx_reviews_rom ON reviews(rom_id);

    -- Emulation compatibility reports (Deck-Verified / ProtonDB style): each user
    -- reports how well a game runs in the in-browser emulator. Aggregated to a
    -- consensus badge; an admin can pin an official rating (roms.compat_official).
    CREATE TABLE IF NOT EXISTS compat_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      rom_id INTEGER NOT NULL REFERENCES roms(id) ON DELETE CASCADE,
      rating TEXT NOT NULL,                   -- playable | runs | broken
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT,
      UNIQUE (user_id, rom_id)
    );
    CREATE INDEX IF NOT EXISTS idx_compat_rom ON compat_reports(rom_id);

    -- Community guides / walkthroughs attached to a game (Steam community guides).
    -- Author is nullable (SET NULL on user delete) so guides survive the author.
    CREATE TABLE IF NOT EXISTS guides (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rom_id INTEGER NOT NULL REFERENCES roms(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_guides_rom ON guides(rom_id);

    -- Direct messages between friends. read_at drives unread counts / badges.
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      recipient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      read_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_messages_pair ON messages(sender_id, recipient_id, id);
    CREATE INDEX IF NOT EXISTS idx_messages_unread ON messages(recipient_id, read_at);

    -- Per-user, per-game emulator A/V preferences (currently the video shader),
    -- applied to EmulatorJS at boot. shader = a bundled .glslp name or 'disabled'.
    CREATE TABLE IF NOT EXISTS emu_prefs (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      rom_id INTEGER NOT NULL REFERENCES roms(id) ON DELETE CASCADE,
      shader TEXT,
      PRIMARY KEY (user_id, rom_id)
    );

    CREATE TABLE IF NOT EXISTS game_cheats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      rom_id INTEGER NOT NULL REFERENCES roms(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      code TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_game_cheats_user_rom ON game_cheats (user_id, rom_id);

    -- Device pairing (Steam-style QR login): an app starts a request and shows
    -- a QR to /pair/<id>; the user scans it on an authenticated device and
    -- approves, minting a token the app retrieves once by polling with a secret.
    CREATE TABLE IF NOT EXISTS pair_requests (
      id TEXT PRIMARY KEY,
      secret_hash TEXT NOT NULL,
      device_name TEXT,
      scope TEXT NOT NULL DEFAULT 'full',
      status TEXT NOT NULL DEFAULT 'pending',
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      token TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL
    );
  `);

  // Drop the retired ra_unlocks table (RA earning via GameHub Player was
  // removed; only per-user RA account linking remains). Harmless if absent.
  db.exec("DROP TABLE IF EXISTS ra_unlocks;");

  // Additive migrations for existing systems tables
  const sysCols = new Set(
    (db.prepare("PRAGMA table_info(systems)").all() as { name: string }[]).map((c) => c.name)
  );
  if (!sysCols.has("show_ribbon"))
    db.exec("ALTER TABLE systems ADD COLUMN show_ribbon INTEGER NOT NULL DEFAULT 1");

  // firmware.sha1: content hash for matching uploads against the BIOS manifest
  // (md5 is the pre-existing column; sha1 is the manifest's primary hash).
  const fwCols = new Set(
    (db.prepare("PRAGMA table_info(firmware)").all() as { name: string }[]).map((c) => c.name)
  );
  if (!fwCols.has("sha1")) db.exec("ALTER TABLE firmware ADD COLUMN sha1 TEXT");

  // api_tokens.expires_at: optional expiry (NULL = never). Enforced in
  // bearerUser so an expired token stops authenticating.
  const apiTokenCols = new Set(
    (db.prepare("PRAGMA table_info(api_tokens)").all() as { name: string }[]).map((c) => c.name)
  );
  if (!apiTokenCols.has("expires_at")) db.exec("ALTER TABLE api_tokens ADD COLUMN expires_at TEXT");
  // logo_dark: 1 when the scraped logo is a dark wordmark (measured on download)
  // — the system header then gives it a light backdrop instead of a dark one.
  if (!sysCols.has("logo_dark"))
    db.exec("ALTER TABLE systems ADD COLUMN logo_dark INTEGER NOT NULL DEFAULT 0");
  // hero_source: 'ribbon' = use the generated cover collage as the hero (default,
  // matches prior behavior); 'image' = use the chosen/scraped hero image instead.
  if (!sysCols.has("hero_source"))
    db.exec("ALTER TABLE systems ADD COLUMN hero_source TEXT NOT NULL DEFAULT 'ribbon'");
  if (!sysCols.has("card_thumb_stale"))
    db.exec("ALTER TABLE systems ADD COLUMN card_thumb_stale INTEGER NOT NULL DEFAULT 1");
  // restriction_profiles: playtime limit + allowed-hours schedule (kid profiles).
  const rpCols = new Set(
    (db.prepare("PRAGMA table_info(restriction_profiles)").all() as { name: string }[]).map((c) => c.name)
  );
  if (!rpCols.has("daily_limit_minutes"))
    db.exec("ALTER TABLE restriction_profiles ADD COLUMN daily_limit_minutes INTEGER");
  if (!rpCols.has("allowed_start_hour"))
    db.exec("ALTER TABLE restriction_profiles ADD COLUMN allowed_start_hour INTEGER");
  if (!rpCols.has("allowed_end_hour"))
    db.exec("ALTER TABLE restriction_profiles ADD COLUMN allowed_end_hour INTEGER");
  // card_thumb_sig / hero_thumb_sig: content fingerprint (hash of the ordered
  // top covers) of the last-rendered collage image. A thumbnail is out of date
  // exactly when the current fingerprint differs from the stored one — so any
  // change (games added, art scraped, ratings reordered, cleanup) is detected
  // without tying regeneration to a specific action. NULL = never rendered.
  if (!sysCols.has("card_thumb_sig")) db.exec("ALTER TABLE systems ADD COLUMN card_thumb_sig TEXT");
  if (!sysCols.has("hero_thumb_sig")) db.exec("ALTER TABLE systems ADD COLUMN hero_thumb_sig TEXT");
  // box_layout: card box-art shape. 'auto' (default) uses box_layout_auto — the
  // shape measured from the system's scraped covers — falling back to a built-in
  // default; a manual 'wide'|'square'|'portrait' overrides it.
  if (!sysCols.has("box_layout"))
    db.exec("ALTER TABLE systems ADD COLUMN box_layout TEXT NOT NULL DEFAULT 'auto'");
  if (!sysCols.has("box_layout_auto")) db.exec("ALTER TABLE systems ADD COLUMN box_layout_auto TEXT");
  // custom_thumb: the collages were built from a hand-picked set of games (custom_covers,
  // a JSON array of cover URLs) and must NOT be overwritten by the auto drift-refresh.
  if (!sysCols.has("custom_thumb"))
    db.exec("ALTER TABLE systems ADD COLUMN custom_thumb INTEGER NOT NULL DEFAULT 0");
  if (!sysCols.has("custom_covers")) db.exec("ALTER TABLE systems ADD COLUMN custom_covers TEXT");

  // Additive migrations for existing databases
  const romCols = new Set(
    (db.prepare("PRAGMA table_info(roms)").all() as { name: string }[]).map((c) => c.name)
  );
  const addRomCol = (name: string, ddl: string) => {
    if (!romCols.has(name)) db.exec(`ALTER TABLE roms ADD COLUMN ${name} ${ddl}`);
  };
  addRomCol("description", "TEXT");
  addRomCol("developer", "TEXT");
  addRomCol("publisher", "TEXT");
  addRomCol("genre", "TEXT");
  addRomCol("players", "TEXT");
  addRomCol("rating", "TEXT"); // ScreenScraper note, e.g. "16/20"
  addRomCol("release_date", "TEXT");
  addRomCol("screenshot_url", "TEXT");
  addRomCol("hero_url", "TEXT");
  addRomCol("icon_url", "TEXT");
  addRomCol("video_url", "TEXT");
  addRomCol("metadata_source", "TEXT");
  addRomCol("scraped_at", "TEXT");
  addRomCol("variant", "TEXT");
  addRomCol("ra_game_id", "INTEGER"); // null = unchecked, 0 = no RA match
  addRomCol("ra_achievements", "INTEGER");
  addRomCol("disc_number", "INTEGER"); // null = single-disc; 1..N for multi-disc sets
  addRomCol("revision", "TEXT"); // "Rev A" / "v1.1" parsed from the filename; null = none
  addRomCol("theme_url", "TEXT"); // uploaded title-theme audio (always wins over YouTube)
  addRomCol("theme_yt_id", "TEXT"); // null = unsearched, '' = no match, else YouTube video id
  addRomCol("manual_url", "TEXT"); // scraped or uploaded PDF manual
  addRomCol("crc32", "TEXT"); // file hashes, filled by the background hash job
  addRomCol("md5", "TEXT");
  addRomCol("sha1", "TEXT");
  // DAT audit verdict vs the local hash DB: null = unchecked, else
  // 'verified' (hash matches a DAT dump), 'mismatch' (known title, wrong/bad
  // dump or hack — hash differs), 'unknown' (not in any loaded DAT).
  addRomCol("dat_status", "TEXT");
  addRomCol("hltb", "TEXT"); // HowLongToBeat times JSON; '' = looked up, no match
  addRomCol("hltb_checked_at", "TEXT");
  addRomCol("age_rating", "TEXT"); // content classification, e.g. "ESRB: E", "PEGI: 12"
  addRomCol("franchise", "TEXT"); // series / franchise, e.g. "Super Mario"
  addRomCol("compat_official", "TEXT"); // admin-pinned emulation rating: playable|runs|broken
  addRomCol("game_modes", "TEXT"); // "Single player, Multiplayer, Co-operative"
  addRomCol("perspectives", "TEXT"); // player perspectives, e.g. "Side view, Bird's-eye view"
  addRomCol("themes", "TEXT"); // "Action, Fantasy, Horror"
  addRomCol("trailer_url", "TEXT"); // IGDB YouTube trailer link, e.g. https://www.youtube.com/watch?v=…
  addRomCol("igdb_related", "TEXT"); // JSON: IGDB similar games, related editions & external links
  addRomCol("logo_url", "TEXT"); // clear-logo / wheel art (transparent game title)
  addRomCol("publisher_image_url", "TEXT"); // publisher logo image
  addRomCol("developer_image_url", "TEXT"); // developer logo image
  addRomCol("rating_image_url", "TEXT"); // age-rating badge image (ESRB/PEGI)

  // updated_at: bumps whenever ANYTHING about a ROM changes (scrape, art pick,
  // rename/move, hash, dat/compat verdict, missing flag, …). Seeded equal to
  // added_at so it starts the same, then a trigger stamps the current time on
  // every UPDATE. Feeds the home "Recent" carousel (recently played + recently
  // updated). Backfill runs once, on column add, BEFORE the triggers exist.
  if (!romCols.has("updated_at")) {
    db.exec("ALTER TABLE roms ADD COLUMN updated_at TEXT");
    db.exec("UPDATE roms SET updated_at = added_at WHERE updated_at IS NULL");
  }
  // New rows inherit added_at; every later change stamps now(). recursive_triggers
  // is off, so the trigger's own write never re-fires it; the WHEN guards also let
  // an explicit updated_at write pass through untouched. (datetime('now') is UTC,
  // matching added_at's default, and second-resolution.)
  db.exec(`CREATE TRIGGER IF NOT EXISTS trg_roms_updated_at_insert
    AFTER INSERT ON roms FOR EACH ROW WHEN NEW.updated_at IS NULL
    BEGIN
      UPDATE roms SET updated_at = COALESCE(NEW.added_at, datetime('now')) WHERE id = NEW.id;
    END`);
  db.exec(`CREATE TRIGGER IF NOT EXISTS trg_roms_updated_at_touch
    AFTER UPDATE ON roms FOR EACH ROW WHEN NEW.updated_at IS OLD.updated_at
    BEGIN
      UPDATE roms SET updated_at = datetime('now') WHERE id = NEW.id;
    END`);

  // rating_level: numeric minimum age derived from age_rating, so kid profiles
  // can cap content across every rating board with one comparison. Backfilled
  // once from existing ratings; the scraper keeps it in sync going forward.
  if (!romCols.has("rating_level")) {
    db.exec("ALTER TABLE roms ADD COLUMN rating_level INTEGER");
    const rows = db
      .prepare("SELECT id, age_rating FROM roms WHERE age_rating IS NOT NULL AND age_rating <> ''")
      .all() as { id: number; age_rating: string }[];
    const upd = db.prepare("UPDATE roms SET rating_level = ? WHERE id = ?");
    db.transaction(() => {
      for (const r of rows) {
        const lv = ratingLevel(r.age_rating);
        if (lv != null) upd.run(lv, r.id);
      }
    })();
  }

  // language: comma-joined codes ("En,Fr,De") from filename tags / region.
  // Backfill the whole library once when the column first appears.
  if (!romCols.has("language")) {
    db.exec("ALTER TABLE roms ADD COLUMN language TEXT");
    const rows = db
      .prepare("SELECT id, filename, region FROM roms")
      .all() as { id: number; filename: string; region: string | null }[];
    const upd = db.prepare("UPDATE roms SET language = ? WHERE id = ?");
    db.transaction(() => {
      for (const r of rows) {
        const lang = parseLanguages(r.filename, r.region);
        if (lang) upd.run(lang, r.id);
      }
    })();
  }

  // revision: parsed once from existing filenames when the column first appears
  // (column already added above by addRomCol). Inline regex mirrors
  // scanner.parseRevision to avoid a circular import.
  if (!romCols.has("revision")) {
    const rows = db.prepare("SELECT id, filename FROM roms").all() as {
      id: number;
      filename: string;
    }[];
    const upd = db.prepare("UPDATE roms SET revision = ? WHERE id = ?");
    db.transaction(() => {
      for (const r of rows) {
        const base = r.filename.replace(/\.[^.]+$/, "");
        const rev = base.match(/\(Rev\s*([0-9A-Za-z]+)\)/i);
        const ver = base.match(/\((?:v|version)\s*([0-9][0-9.]*)\)/i);
        const value = rev ? `Rev ${rev[1].toUpperCase()}` : ver ? `v${ver[1]}` : null;
        if (value) upd.run(value, r.id);
      }
    })();
  }

  const userCols = new Set(
    (db.prepare("PRAGMA table_info(users)").all() as { name: string }[]).map((c) => c.name)
  );
  const addUserCol = (name: string, ddl: string) => {
    if (!userCols.has(name)) db.exec(`ALTER TABLE users ADD COLUMN ${name} ${ddl}`);
  };
  addUserCol("display_name", "TEXT");
  addUserCol("real_name", "TEXT");
  addUserCol("location", "TEXT");
  addUserCol("avatar_url", "TEXT");
  addUserCol("background_url", "TEXT");
  addUserCol("theme", "TEXT"); // profile color theme: default | summer | midnight
  addUserCol("featured_badge", "TEXT"); // badge key shown next to the level
  addUserCol("status", "TEXT"); // online | away | invisible (manual presence preference)
  addUserCol("last_seen", "TEXT"); // ISO time of last activity — drives real online presence
  addUserCol("playing_rom_id", "INTEGER"); // game currently being played (live now-playing presence)
  addUserCol("playing_since", "TEXT"); // when the current play session started
  addUserCol("oidc_sub", "TEXT"); // OpenID Connect subject this account is linked to
  // Assigned age/content-restriction profile (restriction_profiles.id), or NULL
  // for unrestricted (full library). Enforced by hiddenFilter.
  addUserCol("restriction_profile_id", "INTEGER");
  // role: admin | editor | viewer — backfilled from is_admin when first added
  if (!userCols.has("role")) {
    db.exec("ALTER TABLE users ADD COLUMN role TEXT");
    db.exec("UPDATE users SET role = CASE WHEN is_admin = 1 THEN 'admin' ELSE 'viewer' END");
  }

  const colCols = new Set(
    (db.prepare("PRAGMA table_info(collections)").all() as { name: string }[]).map((c) => c.name)
  );
  const addColCol = (name: string, ddl: string) => {
    if (!colCols.has(name)) db.exec(`ALTER TABLE collections ADD COLUMN ${name} ${ddl}`);
  };
  addColCol("is_smart", "INTEGER NOT NULL DEFAULT 0"); // membership from filters, not hand-picking
  addColCol("filters", "TEXT"); // SmartFilters JSON when is_smart = 1
  addColCol("is_public", "INTEGER NOT NULL DEFAULT 0"); // visible to every user on the instance

  const urCols = new Set(
    (db.prepare("PRAGMA table_info(user_roms)").all() as { name: string }[]).map((c) => c.name)
  );
  const addUrCol = (name: string, ddl: string) => {
    if (!urCols.has(name)) db.exec(`ALTER TABLE user_roms ADD COLUMN ${name} ${ddl}`);
  };
  addUrCol("notes", "TEXT"); // personal notes, only visible to the user
  addUrCol("user_rating", "INTEGER"); // 1..10
  addUrCol("difficulty", "INTEGER"); // 1..10
  addUrCol("completion", "INTEGER"); // 0..100 percent
  addUrCol("hidden", "INTEGER NOT NULL DEFAULT 0"); // hide from this user's grids
  addUrCol("hero_plain", "INTEGER NOT NULL DEFAULT 0"); // show game-details hero as art only (no logo/title)

  const stateCols = new Set(
    (db.prepare("PRAGMA table_info(save_states)").all() as { name: string }[]).map((c) => c.name)
  );
  if (!stateCols.has("label")) {
    db.exec("ALTER TABLE save_states ADD COLUMN label TEXT");
  }
  // File locations tracked in the DB (relative to the data dir).
  if (!stateCols.has("state_path")) db.exec("ALTER TABLE save_states ADD COLUMN state_path TEXT");
  if (!stateCols.has("screenshot_path"))
    db.exec("ALTER TABLE save_states ADD COLUMN screenshot_path TEXT");

  const batteryCols = new Set(
    (db.prepare("PRAGMA table_info(battery_saves)").all() as { name: string }[]).map((c) => c.name)
  );
  if (!batteryCols.has("save_path")) db.exec("ALTER TABLE battery_saves ADD COLUMN save_path TEXT");
  if (!batteryCols.has("screenshot_path"))
    db.exec("ALTER TABLE battery_saves ADD COLUMN screenshot_path TEXT");

  const tokenCols = new Set(
    (db.prepare("PRAGMA table_info(api_tokens)").all() as { name: string }[]).map((c) => c.name)
  );
  if (!tokenCols.has("scope")) {
    // full = act as the user; editor/viewer cap the token's effective role
    db.exec("ALTER TABLE api_tokens ADD COLUMN scope TEXT NOT NULL DEFAULT 'full'");
  }
}

export function getDb(): Database.Database {
  if (!globalForDb.__gamehubDb) {
    globalForDb.__gamehubDb = createDb();
  }
  return globalForDb.__gamehubDb;
}

/** Close the singleton so the database file can be swapped (backup restore).
 *  The next getDb() reopens it and re-runs migrations. */
export function closeDb() {
  if (globalForDb.__gamehubDb) {
    try {
      globalForDb.__gamehubDb.close();
    } catch {}
    globalForDb.__gamehubDb = undefined;
  }
}

// ---------- settings helpers ----------

export function getSetting(key: string): string | null {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

// ---------- per-user settings (BPM settings pages) ----------

export function getUserSettings(userId: number): Record<string, string> {
  const rows = getDb()
    .prepare("SELECT key, value FROM user_settings WHERE user_id = ?")
    .all(userId) as { key: string; value: string }[];
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export function setUserSetting(userId: number, key: string, value: string) {
  getDb()
    .prepare(
      `INSERT INTO user_settings (user_id, key, value) VALUES (?, ?, ?)
       ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value`
    )
    .run(userId, key, value);
}

export function deleteUserSettings(userId: number, keys: string[]) {
  if (!keys.length) return;
  const stmt = getDb().prepare("DELETE FROM user_settings WHERE user_id = ? AND key = ?");
  const tx = getDb().transaction((ks: string[]) => ks.forEach((k) => stmt.run(userId, k)));
  tx(keys);
}

// ---------- earned achievement badges ----------

export interface EarnedBadgeRow {
  badge_key: string;
  family: string;
  name: string;
  detail: string;
  xp: number;
  icon: string;
  color: string;
  art: string;
  tier: number;
  earned_at: string;
}

/** All of a user's earned badges, newest first. */
export function listUserBadges(userId: number): EarnedBadgeRow[] {
  return getDb()
    .prepare("SELECT * FROM user_badges WHERE user_id = ? ORDER BY earned_at DESC, xp DESC")
    .all(userId) as EarnedBadgeRow[];
}

/** The set of badge_keys a user already has — for cheap "is this new?" checks. */
export function earnedBadgeKeys(userId: number): Set<string> {
  const rows = getDb()
    .prepare("SELECT badge_key FROM user_badges WHERE user_id = ?")
    .all(userId) as { badge_key: string }[];
  return new Set(rows.map((r) => r.badge_key));
}

/** Insert earned badges (ignoring any already present). Returns the rows actually
 *  inserted, so the caller can decide whether to notify. */
export function insertUserBadges(
  userId: number,
  badges: Omit<EarnedBadgeRow, "earned_at">[]
): EarnedBadgeRow[] {
  if (!badges.length) return [];
  const db = getDb();
  const existing = earnedBadgeKeys(userId);
  const fresh = badges.filter((b) => !existing.has(b.badge_key));
  if (!fresh.length) return [];
  const now = new Date().toISOString();
  const stmt = db.prepare(
    `INSERT OR IGNORE INTO user_badges
       (user_id, badge_key, family, name, detail, xp, icon, color, art, tier, earned_at)
     VALUES (@user_id, @badge_key, @family, @name, @detail, @xp, @icon, @color, @art, @tier, @earned_at)`
  );
  const tx = db.transaction((rows: (Omit<EarnedBadgeRow, "earned_at"> & { earned_at: string })[]) => {
    for (const r of rows) stmt.run({ ...r, user_id: userId });
  });
  const withTs = fresh.map((b) => ({ ...b, earned_at: now }));
  tx(withTs);
  return withTs;
}

export function setSetting(key: string, value: string) {
  getDb()
    .prepare(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
    )
    .run(key, value);
}

export function getLibraryPaths(): string[] {
  const raw = getSetting("library_paths");
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((p) => typeof p === "string") : [];
  } catch {
    return [];
  }
}

// ---------- home-page news: announcements + external feed config ----------

export interface AnnouncementRow {
  id: number;
  title: string;
  body: string;
  published: number;
  created_by: number | null;
  created_at: string;
}

/** Announcements newest-first. `publishedOnly` for the home feed; admins see all. */
export function listAnnouncements(publishedOnly = false): AnnouncementRow[] {
  const where = publishedOnly ? "WHERE published = 1" : "";
  return getDb()
    .prepare(`SELECT * FROM announcements ${where} ORDER BY created_at DESC, id DESC`)
    .all() as AnnouncementRow[];
}

export function createAnnouncement(title: string, body: string, userId: number): number {
  const info = getDb()
    .prepare("INSERT INTO announcements (title, body, created_by) VALUES (?, ?, ?)")
    .run(title, body, userId);
  return Number(info.lastInsertRowid);
}

export function deleteAnnouncement(id: number) {
  getDb().prepare("DELETE FROM announcements WHERE id = ?").run(id);
}

export interface NewsFeed {
  url: string;
  label: string;
}

/** Default ROM-hacking / translation feeds. Reddit exposes Atom at /.rss and is
 *  reliable to parse; users can add or replace these in Settings › News. */
export const DEFAULT_NEWS_FEEDS: NewsFeed[] = [
  { url: "https://www.reddit.com/r/romhacking/.rss", label: "ROM Hacks" },
  { url: "https://www.reddit.com/r/emulation/.rss", label: "Emulation" },
  { url: "https://www.reddit.com/r/translator/.rss", label: "Translations" },
];

export function getNewsFeeds(): NewsFeed[] {
  const raw = getSetting("news_feeds");
  if (raw == null) return DEFAULT_NEWS_FEEDS;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((f) => f && typeof f.url === "string")
      .map((f) => ({ url: String(f.url), label: String(f.label ?? f.url) }));
  } catch {
    return [];
  }
}

export function setNewsFeeds(feeds: NewsFeed[]) {
  setSetting("news_feeds", JSON.stringify(feeds));
}

export function isExternalNewsEnabled(): boolean {
  return getSetting("news_external") !== "off";
}

// ---------- systems table (supported-console registry) ----------

export interface SystemRow {
  id: number;
  slug: string;
  name: string;
  short_name: string | null;
  vendor: string | null;
  color: string | null;
  ss_id: number | null;
  ejs_core: string | null;
  manufacturer: string | null;
  system_type: string | null;
  year_start: string | null;
  year_end: string | null;
  media_format: string | null;
  name_jp: string | null;
  alt_names: string | null;
  metadata_source: string | null;
  scraped_at: string | null;
  show_hero: number;
  show_logo: number;
  show_icon: number;
  show_ribbon: number;
  /** 1 when the scraped logo is a dark wordmark (drives the header backdrop) */
  logo_dark: number;
  /** 'ribbon' = generated cover collage as the hero; 'image' = scraped image */
  hero_source: string;
  /** legacy boolean (superseded by the *_thumb_sig fingerprints) */
  card_thumb_stale: number;
  /** content fingerprint of the last-rendered browse-card collage (null = none) */
  card_thumb_sig: string | null;
  /** content fingerprint of the last-rendered detail-page hero collage */
  hero_thumb_sig: string | null;
  /** card box-art shape override: 'auto' | 'wide' | 'square' | 'portrait' */
  box_layout: string;
  /** shape measured from this system's scraped covers (used when box_layout='auto') */
  box_layout_auto: string | null;
  /** 1 = collages were built from a hand-picked game set; auto-refresh must skip it */
  custom_thumb: number;
  /** JSON array of the hand-picked cover URLs backing the custom collage (null = none) */
  custom_covers: string | null;
  hidden: number;
  enabled: number;
}

/** Scraped console metadata, camelCased for the UI. */
export interface SystemMeta {
  manufacturer: string | null;
  systemType: string | null;
  yearStart: string | null;
  yearEnd: string | null;
  mediaFormat: string | null;
  nameJp: string | null;
  altNames: string | null;
  source: string | null;
  scrapedAt: string | null;
}

/**
 * Seed / refresh the systems table from the supported-systems manifest
 * (PLATFORMS + the ScreenScraper id preset). Manifest-derived columns are kept
 * current on every run; scraped metadata, media visibility and hiding are left
 * untouched (they live only in the DB). Runs on startup and on library updates.
 */
function seedSystems(db: Database.Database): string[] {
  // Consoles already registered — anything in the manifest but not here is a
  // newly-supported system to be inserted.
  const existing = new Set(
    (db.prepare("SELECT slug FROM systems").all() as { slug: string }[]).map((r) => r.slug)
  );
  const stmt = db.prepare(
    `INSERT INTO systems (slug, name, short_name, vendor, color, ss_id, ejs_core)
     VALUES (@slug, @name, @short_name, @vendor, @color, @ss_id, @ejs_core)
     ON CONFLICT(slug) DO UPDATE SET
       name = excluded.name, short_name = excluded.short_name,
       vendor = excluded.vendor, color = excluded.color,
       ss_id = excluded.ss_id, ejs_core = excluded.ejs_core`
  );
  const rows = PLATFORMS.map((p) => ({
    slug: p.slug,
    name: p.name,
    short_name: p.shortName,
    vendor: platformVendor(p.slug),
    color: p.color,
    ss_id: SS_SYSTEM_IDS[p.slug] ?? null,
    ejs_core: p.ejsCore ?? null,
  }));
  db.transaction((rs: typeof rows) => {
    for (const r of rs) stmt.run(r);
  })(rows);
  const added = rows.filter((r) => !existing.has(r.slug)).map((r) => r.slug);

  // One-time: fold the legacy hidden_systems setting into the table.
  const legacy = db
    .prepare("SELECT value FROM settings WHERE key = 'hidden_systems'")
    .get() as { value: string } | undefined;
  if (legacy?.value) {
    try {
      const slugs = JSON.parse(legacy.value) as unknown[];
      const upd = db.prepare("UPDATE systems SET hidden = 1 WHERE slug = ?");
      for (const s of slugs) if (typeof s === "string") upd.run(s);
    } catch {}
    db.prepare("DELETE FROM settings WHERE key = 'hidden_systems'").run();
  }

  return added;
}

/** Re-seed the systems table from the manifest (for library-update triggers).
 *  Returns the slugs of any newly-inserted (previously-unregistered) systems. */
export function syncSystems(): string[] {
  return seedSystems(getDb());
}

export function getSystem(slug: string): SystemRow | null {
  return (
    (getDb().prepare("SELECT * FROM systems WHERE slug = ?").get(slug) as
      | SystemRow
      | undefined) ?? null
  );
}

export function getSystemById(id: number): SystemRow | null {
  return (
    (getDb().prepare("SELECT * FROM systems WHERE id = ?").get(id) as
      | SystemRow
      | undefined) ?? null
  );
}

export function getAllSystems(): SystemRow[] {
  return getDb().prepare("SELECT * FROM systems ORDER BY name").all() as SystemRow[];
}

export function getSystemMeta(slug: string): SystemMeta | null {
  const r = getSystem(slug);
  if (!r) return null;
  return {
    manufacturer: r.manufacturer,
    systemType: r.system_type,
    yearStart: r.year_start,
    yearEnd: r.year_end,
    mediaFormat: r.media_format,
    nameJp: r.name_jp,
    altNames: r.alt_names,
    source: r.metadata_source,
    scrapedAt: r.scraped_at,
  };
}

export function setSystemMeta(
  slug: string,
  m: Partial<Omit<SystemMeta, "scrapedAt">>
) {
  getDb()
    .prepare(
      `UPDATE systems SET
         manufacturer = @manufacturer, system_type = @systemType,
         year_start = @yearStart, year_end = @yearEnd, media_format = @mediaFormat,
         name_jp = @nameJp, alt_names = @altNames, metadata_source = @source,
         scraped_at = @scrapedAt
       WHERE slug = @slug`
    )
    .run({
      slug,
      manufacturer: m.manufacturer ?? null,
      systemType: m.systemType ?? null,
      yearStart: m.yearStart ?? null,
      yearEnd: m.yearEnd ?? null,
      mediaFormat: m.mediaFormat ?? null,
      nameJp: m.nameJp ?? null,
      altNames: m.altNames ?? null,
      source: m.source ?? null,
      scrapedAt: new Date().toISOString(),
    });
}

export function getSystemShow(
  slug: string
): { hero: boolean; logo: boolean; icon: boolean; ribbon: boolean } {
  const r = getSystem(slug);
  return {
    hero: r ? !!r.show_hero : true,
    logo: r ? !!r.show_logo : true,
    icon: r ? !!r.show_icon : true,
    ribbon: r ? !!r.show_ribbon : true,
  };
}

/** Which source backs the system hero: the generated cover collage or a
 *  chosen/scraped image. */
export function setSystemHeroSource(slug: string, source: "ribbon" | "image") {
  getDb().prepare("UPDATE systems SET hero_source = ? WHERE slug = ?").run(source, slug);
}

/** Record whether a system's stored logo is a dark wordmark. Tolerates a
 *  pre-migration DB (column added on the next restart). */
export function setSystemLogoDark(slug: string, dark: boolean) {
  try {
    getDb().prepare("UPDATE systems SET logo_dark = ? WHERE slug = ?").run(dark ? 1 : 0, slug);
  } catch {}
}

export type BoxLayout = "wide" | "square" | "portrait" | "cart";

/** Manual card box-art shape override ('auto' hands it back to auto-detect). */
export function setSystemBoxLayout(slug: string, layout: "auto" | BoxLayout) {
  getDb().prepare("UPDATE systems SET box_layout = ? WHERE slug = ?").run(layout, slug);
}

/** The shape measured from a system's scraped covers (feeds box_layout='auto'). */
export function setSystemBoxLayoutAuto(slug: string, layout: BoxLayout) {
  getDb().prepare("UPDATE systems SET box_layout_auto = ? WHERE slug = ?").run(layout, slug);
}

/** Record the content fingerprint of a system's just-rendered collage image
 *  ('card' or 'hero'), so drift can be detected later. */
export function setSystemThumbSig(slug: string, kind: "card" | "hero", sig: string) {
  const col = kind === "card" ? "card_thumb_sig" : "hero_thumb_sig";
  getDb().prepare(`UPDATE systems SET ${col} = ? WHERE slug = ?`).run(sig, slug);
}

/** Mark a system's collages as a hand-picked custom set (won't be auto-overwritten)
 *  and remember the chosen cover URLs so they can be re-rendered or edited. */
export function setSystemCustomCollage(slug: string, coverUrls: string[]) {
  getDb()
    .prepare("UPDATE systems SET custom_thumb = 1, custom_covers = ? WHERE slug = ?")
    .run(JSON.stringify(coverUrls), slug);
}

/** Revert a system to auto-generated collages (also clears the thumb fingerprints
 *  so the next refresh rebuilds them from the top covers). */
export function clearSystemCustomCollage(slug: string) {
  getDb()
    .prepare(
      "UPDATE systems SET custom_thumb = 0, custom_covers = NULL, card_thumb_sig = NULL, hero_thumb_sig = NULL WHERE slug = ?"
    )
    .run(slug);
}

/** The hand-picked cover URLs backing a system's custom collage, or [] if none. */
export function getSystemCustomCovers(slug: string): string[] {
  const row = getDb().prepare("SELECT custom_covers FROM systems WHERE slug = ?").get(slug) as
    | { custom_covers: string | null }
    | undefined;
  if (!row?.custom_covers) return [];
  try {
    const v = JSON.parse(row.custom_covers);
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function setSystemShow(
  slug: string,
  kind: "hero" | "logo" | "icon" | "ribbon",
  show: boolean
) {
  getDb()
    .prepare(`UPDATE systems SET show_${kind} = ? WHERE slug = ?`)
    .run(show ? 1 : 0, slug);
}

// ---------- hidden systems (backed by the systems table) ----------

export function getHiddenSystems(): Set<string> {
  const rows = getDb()
    .prepare("SELECT slug FROM systems WHERE hidden = 1")
    .all() as { slug: string }[];
  return new Set(rows.map((r) => r.slug));
}

export function setHiddenSystems(slugs: string[]) {
  const wanted = new Set(slugs);
  const all = getDb().prepare("SELECT slug FROM systems").all() as { slug: string }[];
  const upd = getDb().prepare("UPDATE systems SET hidden = ? WHERE slug = ?");
  getDb().transaction(() => {
    for (const { slug } of all) upd.run(wanted.has(slug) ? 1 : 0, slug);
  })();
}

// ---------- age / content-restriction profiles ----------

/** A named restriction profile. `allowed_systems` is a JSON slug array or null
 *  (all systems); `max_rating` is a min-age cap or null; `hide_unrated` also
 *  drops games with no known rating. */
export interface RestrictionProfile {
  id: number;
  name: string;
  allowed_systems: string | null;
  max_rating: number | null;
  hide_unrated: number;
  daily_limit_minutes: number | null;
  allowed_start_hour: number | null;
  allowed_end_hour: number | null;
  /** How many users this profile is assigned to (list view only) */
  assigned?: number;
}

const RP_COLS =
  "id, name, allowed_systems, max_rating, hide_unrated, daily_limit_minutes, allowed_start_hour, allowed_end_hour";

export function listRestrictionProfiles(): RestrictionProfile[] {
  return getDb()
    .prepare(
      `SELECT p.id, p.name, p.allowed_systems, p.max_rating, p.hide_unrated,
              p.daily_limit_minutes, p.allowed_start_hour, p.allowed_end_hour,
              (SELECT COUNT(*) FROM users u WHERE u.restriction_profile_id = p.id) AS assigned
       FROM restriction_profiles p ORDER BY p.name COLLATE NOCASE`
    )
    .all() as RestrictionProfile[];
}

export function getRestrictionProfile(id: number): RestrictionProfile | undefined {
  return getDb()
    .prepare(`SELECT ${RP_COLS} FROM restriction_profiles WHERE id = ?`)
    .get(id) as RestrictionProfile | undefined;
}

export interface RestrictionInput {
  name: string;
  allowedSystems: string[] | null;
  maxRating: number | null;
  hideUnrated: boolean;
  /** max play minutes/day, or null for no limit */
  dailyLimitMinutes: number | null;
  /** allowed-play window (hours 0-23), both null for anytime */
  allowedStartHour: number | null;
  allowedEndHour: number | null;
}

// Clamp an hour to 0-23 or null; clamp a positive minute limit or null.
const clampHour = (h: number | null): number | null =>
  h == null || !Number.isFinite(h) ? null : Math.max(0, Math.min(23, Math.round(h)));
const clampMinutes = (m: number | null): number | null =>
  m == null || !Number.isFinite(m) || m <= 0 ? null : Math.round(m);

export function createRestrictionProfile(input: RestrictionInput): number {
  const info = getDb()
    .prepare(
      `INSERT INTO restriction_profiles
         (name, allowed_systems, max_rating, hide_unrated, daily_limit_minutes, allowed_start_hour, allowed_end_hour)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.name,
      input.allowedSystems === null ? null : JSON.stringify([...new Set(input.allowedSystems)]),
      input.maxRating,
      input.hideUnrated ? 1 : 0,
      clampMinutes(input.dailyLimitMinutes),
      clampHour(input.allowedStartHour),
      clampHour(input.allowedEndHour)
    );
  return Number(info.lastInsertRowid);
}

export function updateRestrictionProfile(id: number, input: RestrictionInput): void {
  getDb()
    .prepare(
      `UPDATE restriction_profiles
          SET name = ?, allowed_systems = ?, max_rating = ?, hide_unrated = ?,
              daily_limit_minutes = ?, allowed_start_hour = ?, allowed_end_hour = ?
        WHERE id = ?`
    )
    .run(
      input.name,
      input.allowedSystems === null ? null : JSON.stringify([...new Set(input.allowedSystems)]),
      input.maxRating,
      input.hideUnrated ? 1 : 0,
      clampMinutes(input.dailyLimitMinutes),
      clampHour(input.allowedStartHour),
      clampHour(input.allowedEndHour),
      id
    );
}

export function deleteRestrictionProfile(id: number): void {
  const db = getDb();
  db.transaction(() => {
    // Un-assign anyone using it so they revert to unrestricted, then remove it.
    db.prepare("UPDATE users SET restriction_profile_id = NULL WHERE restriction_profile_id = ?").run(id);
    db.prepare("DELETE FROM restriction_profiles WHERE id = ?").run(id);
  })();
}

/** Assign (or clear, with null) a user's restriction profile. */
export function setUserRestrictionProfile(userId: number, profileId: number | null): void {
  getDb().prepare("UPDATE users SET restriction_profile_id = ? WHERE id = ?").run(profileId, userId);
}

/** The effective restriction for a user, resolved through their assigned
 *  profile. Everything null/false when the user has no profile (unrestricted). */
export interface EffectiveRestriction {
  allowedSystems: string[] | null;
  max: number | null;
  hideUnrated: boolean;
}
export function getUserRestriction(userId: number): EffectiveRestriction {
  const row = getDb()
    .prepare(
      `SELECT p.allowed_systems, p.max_rating, p.hide_unrated
       FROM users u JOIN restriction_profiles p ON p.id = u.restriction_profile_id
       WHERE u.id = ?`
    )
    .get(userId) as
    | { allowed_systems: string | null; max_rating: number | null; hide_unrated: number }
    | undefined;
  if (!row) return { allowedSystems: null, max: null, hideUnrated: false };
  let allowedSystems: string[] | null = null;
  try {
    const parsed = row.allowed_systems ? JSON.parse(row.allowed_systems) : null;
    allowedSystems = Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === "string") : null;
  } catch {
    allowedSystems = null;
  }
  return { allowedSystems, max: row.max_rating, hideUnrated: !!row.hide_unrated };
}

/** Whether a restricted user may open a specific game — checks both the system
 *  allow-list and the rating cap. Used to gate direct links / detail pages. */
export function userCanSeeRom(userId: number, romId: number): boolean {
  const r = getUserRestriction(userId);
  if (r.allowedSystems === null && r.max === null && !r.hideUnrated) return true;
  const row = getDb()
    .prepare("SELECT platform_slug, rating_level FROM roms WHERE id = ?")
    .get(romId) as { platform_slug: string; rating_level: number | null } | undefined;
  if (!row) return false;
  if (r.allowedSystems && !r.allowedSystems.includes(row.platform_slug)) return false;
  if (r.max != null && row.rating_level != null && row.rating_level > r.max) return false;
  if (r.hideUnrated && row.rating_level == null) return false;
  return true;
}

// ---------- playtime limits & allowed-hours schedule ----------

/** Today's date in server-local time (YYYY-MM-DD) — the key for daily_play. */
function serverLocalDay(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Add to a user's play tally for today (called from the play heartbeat). */
export function addDailyPlay(userId: number, seconds: number): void {
  getDb()
    .prepare(
      `INSERT INTO daily_play (user_id, day, seconds) VALUES (?, ?, ?)
       ON CONFLICT (user_id, day) DO UPDATE SET seconds = seconds + excluded.seconds`
    )
    .run(userId, serverLocalDay(), seconds);
}

export function getTodayPlaySeconds(userId: number): number {
  const r = getDb()
    .prepare("SELECT seconds FROM daily_play WHERE user_id = ? AND day = ?")
    .get(userId, serverLocalDay()) as { seconds: number } | undefined;
  return r?.seconds ?? 0;
}

export interface PlayAllowance {
  allowed: boolean;
  reason: "schedule" | "limit" | null;
  limitMinutes: number | null;
  usedMinutes: number;
  remainingMinutes: number | null;
  /** allowed-hours window (0-23), or null for anytime */
  window: { start: number; end: number } | null;
}

function hourAllowed(now: number, start: number, end: number): boolean {
  if (start === end) return true; // degenerate window = anytime
  if (start < end) return now >= start && now < end;
  return now >= start || now < end; // wraps past midnight (e.g. 20 → 7)
}

/** Whether a user may play right now, honoring their profile's daily limit and
 *  allowed-hours schedule. Unrestricted users (or profiles without either) are
 *  always allowed. Schedule is reported before the limit for a clearer message. */
export function playAllowance(userId: number): PlayAllowance {
  const row = getDb()
    .prepare(
      `SELECT p.daily_limit_minutes AS lim, p.allowed_start_hour AS s, p.allowed_end_hour AS e
         FROM users u JOIN restriction_profiles p ON p.id = u.restriction_profile_id
        WHERE u.id = ?`
    )
    .get(userId) as { lim: number | null; s: number | null; e: number | null } | undefined;
  const lim = row?.lim ?? null;
  const window = row && row.s != null && row.e != null ? { start: row.s, end: row.e } : null;
  const usedMinutes = Math.floor(getTodayPlaySeconds(userId) / 60);
  const remainingMinutes = lim != null ? Math.max(0, lim - usedMinutes) : null;
  if (window && !hourAllowed(new Date().getHours(), window.start, window.end)) {
    return { allowed: false, reason: "schedule", limitMinutes: lim, usedMinutes, remainingMinutes, window };
  }
  if (lim != null && usedMinutes >= lim) {
    return { allowed: false, reason: "limit", limitMinutes: lim, usedMinutes, remainingMinutes: 0, window };
  }
  return { allowed: true, reason: null, limitMinutes: lim, usedMinutes, remainingMinutes, window };
}

/** Distinct platform slugs that currently have (non-missing) games — the set a
 *  restriction profile can be limited to. */
export function presentSystemSlugs(): string[] {
  return (
    getDb()
      .prepare("SELECT DISTINCT platform_slug FROM roms WHERE missing = 0 ORDER BY platform_slug")
      .all() as { platform_slug: string }[]
  ).map((r) => r.platform_slug);
}

// Scraped ratings arrive as mixed "n/d" strings ("88/100", "1.3/5"), so ranking
// needs the normalized fraction, not the raw number. Games without a parseable
// rating sort last (SQLite orders NULL below any value under DESC) so they only
// backfill the collage when there aren't enough rated titles.
const RATING_RATIO = `CASE WHEN rating LIKE '%/%'
    THEN CAST(substr(rating, 1, instr(rating, '/') - 1) AS REAL)
       / NULLIF(CAST(substr(rating, instr(rating, '/') + 1) AS REAL), 0)
    ELSE NULL END`;

// The collage looks best with landscape key art (scenes + logos) like a Steam
// library capsule, so prefer hero/screenshot art and only fall back to portrait
// box art when that's all a title has. libretro thumbnails are hotlink-flaky
// (they frequently fail to load), so they're excluded — the collage only uses
// art that reliably renders.
const notLibretro = (col: string) =>
  `CASE WHEN ${col} NOT LIKE '%libretro%' THEN NULLIF(${col}, '') END`;
const COLLAGE_ART = `COALESCE(${notLibretro("hero_url")}, ${notLibretro("screenshot_url")}, ${notLibretro("boxart_url")})`;

/** A sample of a system's game BOX-ART urls (portrait/landscape as scanned) —
 *  used to measure the card box-art shape. Unlike getSystemHeroCovers this is
 *  strictly boxart_url (never hero/screenshot), so the aspect reflects the
 *  actual box, not a landscape banner. */
export function sampleSystemBoxart(slug: string, limit = 16): string[] {
  return (
    getDb()
      .prepare(
        `SELECT ${notLibretro("boxart_url")} AS art FROM roms
         WHERE platform_slug = ? AND missing = 0
           AND ${notLibretro("boxart_url")} IS NOT NULL
         LIMIT ?`
      )
      .all(slug, limit) as { art: string }[]
  ).map((r) => r.art);
}

/** Top-rated cover art for one system (for the collage hero). Landscape art
 *  preferred, highest rating first, oldest-added as a stable tiebreak. */
export function getSystemHeroCovers(slug: string, limit = 9): string[] {
  return (
    getDb()
      .prepare(
        `SELECT ${COLLAGE_ART} AS art FROM roms
         WHERE platform_slug = ? AND missing = 0
           AND ${COLLAGE_ART} IS NOT NULL
         ORDER BY (${RATING_RATIO}) DESC, rowid
         LIMIT ?`
      )
      .all(slug, limit) as { art: string }[]
  ).map((r) => r.art);
}

/** A system's games that have cover art — id, title, cover URL — best-rated first.
 *  Feeds the custom-collage game picker on the system detail page. */
export function listSystemGamesWithCovers(
  slug: string,
  limit = 500
): { id: number; title: string; cover: string }[] {
  return getDb()
    .prepare(
      `SELECT id, title, ${COLLAGE_ART} AS cover FROM roms
       WHERE platform_slug = ? AND missing = 0
         AND ${COLLAGE_ART} IS NOT NULL
       ORDER BY (${RATING_RATIO}) DESC, title
       LIMIT ?`
    )
    .all(slug, limit) as { id: number; title: string; cover: string }[];
}

/** Per-user, per-system aggregates for the system-detail play bar: the game
 *  count, how many carry a full scrape, and this user's playtime / last-played
 *  / favorite tallies across the system. Multi-disc sets collapse to disc 1 so
 *  counts line up with the library grid. */
export function getSystemStats(
  userId: number,
  slug: string
): {
  total: number;
  scraped: number;
  favorites: number;
  playtime_seconds: number;
  last_played_at: string | null;
} {
  const row = getDb()
    .prepare(
      `SELECT
         COUNT(*) AS total,
         COALESCE(SUM(CASE WHEN r.scraped_at IS NOT NULL THEN 1 ELSE 0 END), 0) AS scraped,
         COALESCE(SUM(CASE WHEN ur.favorite = 1 THEN 1 ELSE 0 END), 0) AS favorites,
         COALESCE(SUM(ur.playtime_seconds), 0) AS playtime_seconds,
         MAX(ur.last_played_at) AS last_played_at
       FROM roms r
       LEFT JOIN user_roms ur ON ur.rom_id = r.id AND ur.user_id = ?
       WHERE r.platform_slug = ? AND r.missing = 0
         AND (r.disc_number IS NULL OR r.disc_number = 1)`
    )
    .get(userId, slug) as {
    total: number;
    scraped: number;
    favorites: number;
    playtime_seconds: number;
    last_played_at: string | null;
  };
  return row;
}

/** Top-rated cover art for every system at once — one row set for the browse
 *  grid, keyed by platform slug. */
export function getSystemsHeroCovers(limit = 9): Map<string, string[]> {
  const rows = getDb()
    .prepare(
      `SELECT platform_slug, art FROM (
         SELECT platform_slug, ${COLLAGE_ART} AS art,
           ROW_NUMBER() OVER (
             PARTITION BY platform_slug
             ORDER BY (${RATING_RATIO}) DESC, rowid
           ) AS rn
         FROM roms
         WHERE missing = 0 AND ${COLLAGE_ART} IS NOT NULL
       ) WHERE rn <= ?`
    )
    .all(limit) as { platform_slug: string; art: string }[];
  const map = new Map<string, string[]>();
  for (const r of rows) {
    const arr = map.get(r.platform_slug) ?? [];
    arr.push(r.art);
    map.set(r.platform_slug, arr);
  }
  return map;
}

/**
 * SQL fragment + params for library listings: excludes hidden systems and
 * collapses multi-disc sets to their first disc. With `personal` (queries
 * that join user_roms as ur) games the user hid are excluded too.
 */
function hiddenFilter(personal = false, userId?: number): { sql: string; params: string[] } {
  const hidden = [...getHiddenSystems()];
  const params: string[] = [];
  let sql = "";
  // Globally hidden systems (admin-hidden consoles) — placeholders first so
  // params stay in the same positional order the callers splice them in.
  if (hidden.length) {
    sql += ` AND r.platform_slug NOT IN (${hidden.map(() => "?").join(",")})`;
    params.push(...hidden);
  }
  // Age-restriction profile: constrain to the profile's allowed systems (an
  // empty allow-list sees nothing, AND 0) and its rating cap. Unrated games pass
  // unless the profile hides them too. No profile → no extra clauses.
  if (userId !== undefined) {
    const r = getUserRestriction(userId);
    if (r.allowedSystems) {
      if (r.allowedSystems.length === 0) {
        sql += " AND 0";
      } else {
        sql += ` AND r.platform_slug IN (${r.allowedSystems.map(() => "?").join(",")})`;
        params.push(...r.allowedSystems);
      }
    }
    if (r.max != null) {
      sql += r.hideUnrated
        ? " AND r.rating_level IS NOT NULL AND r.rating_level <= ?"
        : " AND (r.rating_level IS NULL OR r.rating_level <= ?)";
      params.push(String(r.max));
    } else if (r.hideUnrated) {
      sql += " AND r.rating_level IS NOT NULL";
    }
  }
  sql += " AND (r.disc_number IS NULL OR r.disc_number = 1)";
  if (personal) sql += " AND COALESCE(ur.hidden, 0) = 0";
  return { sql, params };
}

// ---------- system folder mappings (RomM-style) ----------

export interface SystemFolderRow {
  id: number;
  platform_slug: string;
  path: string;
  variant: string | null;
}

export function getSystemFolders(): SystemFolderRow[] {
  return getDb()
    .prepare(
      "SELECT id, platform_slug, path, variant FROM system_folders ORDER BY platform_slug, variant"
    )
    .all() as SystemFolderRow[];
}

export function setSystemFolders(
  entries: { platform_slug: string; path: string; variant: string | null }[]
) {
  const db = getDb();
  const replace = db.transaction(() => {
    db.prepare("DELETE FROM system_folders").run();
    const insert = db.prepare(
      "INSERT OR IGNORE INTO system_folders (platform_slug, path, variant) VALUES (?, ?, ?)"
    );
    for (const e of entries) {
      insert.run(e.platform_slug, e.path, e.variant?.trim().toLowerCase() || null);
    }
  });
  replace();
}

// ---------- row types ----------

export interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  is_admin: number;
  created_at: string;
  display_name: string | null;
  real_name: string | null;
  location: string | null;
  avatar_url: string | null;
  background_url: string | null;
  theme: string | null;
  featured_badge: string | null;
  status: string | null;
  oidc_sub: string | null;
  role: string | null;
}

export interface RomRow {
  id: number;
  path: string;
  filename: string;
  title: string;
  sort_title: string;
  platform_slug: string;
  size_bytes: number;
  boxart_url: string | null;
  region: string | null;
  added_at: string;
  missing: number;
  description: string | null;
  developer: string | null;
  publisher: string | null;
  genre: string | null;
  players: string | null;
  rating: string | null;
  release_date: string | null;
  screenshot_url: string | null;
  hero_url: string | null;
  icon_url: string | null;
  video_url: string | null;
  metadata_source: string | null;
  scraped_at: string | null;
  variant: string | null;
  ra_game_id: number | null;
  ra_achievements: number | null;
  disc_number: number | null;
  theme_url: string | null;
  theme_yt_id: string | null;
  manual_url: string | null;
  language: string | null;
  crc32: string | null;
  md5: string | null;
  sha1: string | null;
  hltb: string | null;
  hltb_checked_at: string | null;
  age_rating: string | null;
  franchise: string | null;
  trailer_url: string | null;
  igdb_related: string | null;
  game_modes: string | null;
  perspectives: string | null;
  themes: string | null;
  logo_url: string | null;
  publisher_image_url: string | null;
  developer_image_url: string | null;
  rating_image_url: string | null;
}

/** RomRow joined with the current user's per-game state */
export interface LibraryRomRow extends RomRow {
  favorite: number;
  play_status: string;
  playtime_seconds: number;
  last_played_at: string | null;
  hidden: number;
  hero_plain: number;
  notes: string | null;
  user_rating: number | null;
  difficulty: number | null;
  completion: number | null;
}

export interface CollectionRow {
  id: number;
  user_id: number;
  name: string;
  description: string;
  created_at: string;
  is_smart: number;
  filters: string | null;
  is_public: number;
  item_count?: number;
}

// ---------- rom queries ----------

const LIBRARY_SELECT = `
  SELECT r.*,
         COALESCE(ur.favorite, 0) AS favorite,
         COALESCE(ur.play_status, 'none') AS play_status,
         COALESCE(ur.playtime_seconds, 0) AS playtime_seconds,
         ur.last_played_at AS last_played_at,
         COALESCE(ur.hidden, 0) AS hidden,
         COALESCE(ur.hero_plain, 0) AS hero_plain,
         ur.notes AS notes,
         ur.user_rating AS user_rating,
         ur.difficulty AS difficulty,
         ur.completion AS completion
  FROM roms r
  LEFT JOIN user_roms ur ON ur.rom_id = r.id AND ur.user_id = ?
  WHERE r.missing = 0
`;

/** Slim row for browsing grids — omits descriptions and other heavy fields
 *  so pages with tens of thousands of games stay fast to serialize. */
export interface BrowseRomRow {
  id: number;
  title: string;
  boxart_url: string | null;
  video_url?: string | null;
  platform_slug: string;
  variant: string | null;
  language: string | null;
  added_at: string;
  favorite: number;
  play_status: string;
  playtime_seconds: number;
  hidden: number;
  /** effective card box-art shape ('wide'|'square'|'portrait') or null */
  box_layout?: string | null;
}

const BROWSE_SELECT = `
  SELECT r.id, r.title, r.boxart_url, r.video_url, r.platform_slug, r.variant, r.language, r.added_at,
         COALESCE(ur.favorite, 0) AS favorite,
         COALESCE(ur.play_status, 'none') AS play_status,
         COALESCE(ur.playtime_seconds, 0) AS playtime_seconds,
         COALESCE(ur.hidden, 0) AS hidden
  FROM roms r
  LEFT JOIN user_roms ur ON ur.rom_id = r.id AND ur.user_id = ?
  WHERE r.missing = 0
`;

export function listLibraryBrowse(userId: number, platformSlug?: string): BrowseRomRow[] {
  const h = hiddenFilter(true, userId);
  const plat = platformSlug ? " AND r.platform_slug = ?" : "";
  const params: (string | number)[] = [userId, ...h.params];
  if (platformSlug) params.push(platformSlug);
  return getDb()
    .prepare(`${BROWSE_SELECT}${h.sql}${plat} ORDER BY r.sort_title`)
    .all(...params) as BrowseRomRow[];
}

/** SQL-side filtered/paged browse for the full-library page — the whole
 *  52k-game table never leaves the server. */
/** Match one token inside a comma-separated column ("Action, Platform") */
function tokenCond(column: string): string {
  return `(',' || REPLACE(COALESCE(${column}, ''), ', ', ',') || ',') LIKE '%,' || ? || ',%'`;
}

/** Library grid sort keys -> ORDER BY clause. Steam's SORT BY, mapped to our
 *  columns. `name` is the default. These run in the OUTER query of the deduped
 *  browse (see searchLibraryBrowse), so they reference the selected aliases,
 *  not r./ur. columns. */
const BROWSE_SORTS: Record<string, string> = {
  name: "sort_title",
  achievements: "completion DESC, sort_title",
  playtime: "playtime_seconds DESC, sort_title",
  played: "last_played_at DESC, sort_title",
  release: "release_date DESC, sort_title",
  added: "added_at DESC, sort_title",
  size: "size_bytes DESC, sort_title",
  rating: "user_rating DESC, sort_title",
};

export function searchLibraryBrowse(
  userId: number,
  opts: {
    q?: string;
    tab?: string;
    platform?: string;
    variant?: string;
    /** Comma-separated genres — matches ANY (OR) */
    genre?: string;
    /** Comma-separated game modes ("Single player,Multiplayer") — matches ANY */
    modes?: string;
    language?: string;
    /** Comma-separated "missing" gaps — matches games missing ANY chosen piece:
     *  meta | boxart | hero | logo | description */
    missing?: string;
    /** Virtual collection: metadata dimension (genre|developer|publisher)… */
    virtualDim?: string;
    /** …and the value to match within it (paired with virtualDim) */
    virtualValue?: string;
    /** Collection tab: a numeric collection id (standard or smart) */
    collection?: string;
    /** Sort key from BROWSE_SORTS (default: name) */
    sort?: string;
    offset?: number;
    limit?: number;
    /** Only the deduped total is needed (tab-count labels) — skip the rows
     *  query entirely so the expensive dedup window runs once, not twice. */
    countOnly?: boolean;
  }
): { rows: BrowseRomRow[]; total: number } {
  // The Hidden tab shows ONLY user-hidden games; everywhere else hides them
  const hiddenTab = opts.tab === "hidden";
  const h = hiddenFilter(!hiddenTab, userId);
  const conds: string[] = [];
  const params: (string | number)[] = [];
  if (hiddenTab) conds.push("COALESCE(ur.hidden, 0) = 1");
  // Every facet is multi-select (comma-separated): a row matches ANY chosen
  // value (Steam's checkbox-group semantics). Single values (system pages)
  // just split into a one-element list, so the behaviour is unchanged there.
  const splitVals = (v?: string) => (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const platformVals = splitVals(opts.platform);
  if (platformVals.length) {
    conds.push(`r.platform_slug IN (${platformVals.map(() => "?").join(",")})`);
    params.push(...platformVals);
  }
  const variantVals = splitVals(opts.variant);
  if (variantVals.length) {
    const orParts: string[] = [];
    const named = variantVals.filter((v) => v !== "main");
    if (variantVals.includes("main")) orParts.push("r.variant IS NULL");
    if (named.length) {
      orParts.push(`r.variant IN (${named.map(() => "?").join(",")})`);
      params.push(...named);
    }
    if (orParts.length) conds.push(`(${orParts.join(" OR ")})`);
  }
  const genreVals = splitVals(opts.genre);
  if (genreVals.length) {
    conds.push(`(${genreVals.map(() => tokenCond("r.genre")).join(" OR ")})`);
    params.push(...genreVals);
  }
  const modeVals = splitVals(opts.modes);
  if (modeVals.length) {
    conds.push(`(${modeVals.map(() => tokenCond("r.game_modes")).join(" OR ")})`);
    params.push(...modeVals);
  }
  const langVals = splitVals(opts.language);
  if (langVals.length) {
    conds.push(`(${langVals.map(() => tokenCond("r.language")).join(" OR ")})`);
    params.push(...langVals);
  }
  // "Missing" gaps — for finding un-scraped / art-less games. A row matches when
  // it's missing ANY of the chosen pieces (OR within the group). Unknown keys
  // are ignored. libretro placeholder URLs count as "no real art".
  const MISSING_COND: Record<string, string> = {
    meta: "r.scraped_at IS NULL",
    boxart: `${notLibretro("boxart_url")} IS NULL`,
    hero: `${notLibretro("hero_url")} IS NULL`,
    logo: `${notLibretro("logo_url")} IS NULL`,
    description: "COALESCE(r.description, '') = ''",
  };
  const missingVals = splitVals(opts.missing).filter((k) => k in MISSING_COND);
  if (missingVals.length) {
    conds.push(`(${missingVals.map((k) => MISSING_COND[k]).join(" OR ")})`);
  }
  // Virtual collection lock: pin to one metadata value (genre/developer/publisher)
  if (
    opts.virtualDim &&
    opts.virtualValue &&
    VIRTUAL_DIMENSIONS.includes(opts.virtualDim as VirtualDimension)
  ) {
    conds.push(virtualCond(opts.virtualDim as VirtualDimension));
    params.push(opts.virtualValue);
  }
  if (opts.tab === "favorites") conds.push("ur.favorite = 1");
  else if (opts.tab && ["playing", "backlog", "beaten", "dropped"].includes(opts.tab)) {
    conds.push("ur.play_status = ?");
    params.push(opts.tab);
  }
  // Collection tab: standard = hand-picked membership; smart = live filters.
  if (opts.collection) {
    const cid = Number(opts.collection);
    if (Number.isFinite(cid)) {
      const col = getDb()
        .prepare("SELECT * FROM collections WHERE id = ? AND (user_id = ? OR is_public = 1)")
        .get(cid, userId) as CollectionRow | undefined;
      if (col?.is_smart === 1) {
        const sw = smartWhere(parseSmartFilters(col.filters));
        if (sw.sql) {
          conds.push(sw.sql.replace(/^ AND /, ""));
          params.push(...sw.params);
        }
      } else if (col) {
        conds.push("r.id IN (SELECT rom_id FROM collection_items WHERE collection_id = ?)");
        params.push(cid);
      } else {
        // Unknown/forbidden collection id — match nothing rather than everything
        conds.push("0 = 1");
      }
    }
  }
  const condsNoQ = [...conds];
  const paramsNoQ = [...params];
  if (opts.q) {
    conds.push("r.title LIKE ?");
    params.push(`%${opts.q}%`);
  }
  const where = conds.length ? ` AND ${conds.join(" AND ")}` : "";
  const limit = Math.min(Math.max(opts.limit ?? 150, 1), 500);
  const offset = Math.max(opts.offset ?? 0, 0);
  const orderBy = BROWSE_SORTS[opts.sort ?? "name"] ?? BROWSE_SORTS.name;
  const db = getDb();
  // One card per game per system: collapse ROMs that share a system + sort_title
  // (the same game — regional versions, hacks, translations, extra discs) to a
  // single representative. But ONLY when the group genuinely varies in
  // region/language/variant/disc — a group that's uniform on all of those is
  // really distinct games that happened to parse to the same title (e.g. folder
  // games all named "root"), so those are kept separate rather than hidden.
  const rank = `(CASE WHEN r.variant IS NULL THEN 0 ELSE 1 END) * 1000000000000
    + (CASE UPPER(COALESCE(r.region, ''))
         WHEN 'USA' THEN 0 WHEN 'U' THEN 0
         WHEN 'WORLD' THEN 1
         WHEN 'EUROPE' THEN 2 WHEN 'E' THEN 2
         WHEN 'JAPAN' THEN 3 WHEN 'J' THEN 3
         ELSE 5 END) * 1000000000
    + r.id`;
  const combo = `COALESCE(r.region,'') || '|' || COALESCE(r.language,'') || '|' || COALESCE(r.variant,'') || '|' || COALESCE(CAST(r.disc_number AS TEXT),'') || '|' || COALESCE(r.revision,'')`;
  const part = "PARTITION BY r.platform_slug, r.sort_title";
  // __varied = 1 when the group has more than one distinct region/language/
  // variant/disc combo (SQLite has no COUNT(DISTINCT) window, so compare
  // MIN vs MAX of the combo string).
  const win = `
    ROW_NUMBER() OVER (${part} ORDER BY ${rank}) AS __rn,
    (MIN(${combo}) OVER (${part}) <> MAX(${combo}) OVER (${part})) AS __varied`;
  // keep every row of a uniform group (distinct games mis-parsed to one title),
  // or just the representative of a genuinely-varied group
  const keep = "WHERE __varied = 0 OR __rn = 1";
  const rows = opts.countOnly
    ? []
    : db
    .prepare(
      `SELECT * FROM (
         SELECT r.id, r.title, r.boxart_url, r.video_url, r.platform_slug, r.variant, r.language, r.added_at,
                COALESCE(ur.favorite, 0) AS favorite,
                COALESCE(ur.play_status, 'none') AS play_status,
                COALESCE(ur.playtime_seconds, 0) AS playtime_seconds,
                COALESCE(ur.hidden, 0) AS hidden,
                r.sort_title AS sort_title,
                COALESCE(ur.completion, 0) AS completion,
                ur.last_played_at AS last_played_at,
                r.release_date AS release_date,
                r.size_bytes AS size_bytes,
                COALESCE(ur.user_rating, 0) AS user_rating,
                COALESCE(NULLIF(sy.box_layout, 'auto'), sy.box_layout_auto) AS box_layout,
                ${win}
         FROM roms r
         LEFT JOIN user_roms ur ON ur.rom_id = r.id AND ur.user_id = ?
         LEFT JOIN systems sy ON sy.slug = r.platform_slug
         WHERE r.missing = 0${h.sql}${where}
       ) ${keep}
       ORDER BY ${orderBy} LIMIT ? OFFSET ?`
    )
    .all(userId, ...h.params, ...params, limit, offset) as BrowseRomRow[];
  const total = (
    db
      .prepare(
        `SELECT COUNT(*) c FROM (
           SELECT ${win}
           FROM roms r
           LEFT JOIN user_roms ur ON ur.rom_id = r.id AND ur.user_id = ?
           WHERE r.missing = 0${h.sql}${where}
         ) ${keep}`
      )
      .get(userId, ...h.params, ...params) as { c: number }
  ).c;

  // Typo tolerance (Steam ships fastest-levenshtein for exactly this): when
  // a substring search comes up nearly empty, rank the remaining candidate
  // titles by edit distance and surface the closest ones.
  if (!opts.countOnly && opts.q && opts.q.length >= 3 && offset === 0 && total < 5) {
    const qn = opts.q.toLowerCase();
    // a single transposition = 2 edits, so ≥5-char queries allow 2
    const maxDist = qn.length <= 4 ? 1 : qn.length <= 8 ? 2 : 3;
    const whereNoQ = condsNoQ.length ? ` AND ${condsNoQ.join(" AND ")}` : "";
    const candidates = db
      .prepare(
        `SELECT r.id, r.title FROM roms r
         LEFT JOIN user_roms ur ON ur.rom_id = r.id AND ur.user_id = ?
         WHERE r.missing = 0${h.sql}${whereNoQ}`
      )
      .all(userId, ...h.params, ...paramsNoQ) as { id: number; title: string }[];
    const have = new Set(rows.map((r) => r.id));
    const scored: { id: number; d: number }[] = [];
    for (const c of candidates) {
      if (have.has(c.id)) continue;
      const t = c.title.toLowerCase();
      // best of: the whole title, or any single word (typo'd short queries)
      let best = distance(qn, t);
      if (best > maxDist) {
        for (const w of t.split(/[^a-z0-9]+/)) {
          if (!w || Math.abs(w.length - qn.length) > maxDist) continue;
          const d = distance(qn, w);
          if (d < best) best = d;
          if (best <= maxDist) break;
        }
      }
      if (best <= maxDist) scored.push({ id: c.id, d: best });
    }
    scored.sort((a, b) => a.d - b.d);
    const wanted = scored.slice(0, Math.max(0, limit - rows.length)).map((s) => s.id);
    if (wanted.length > 0) {
      const fuzzyRows = db
        .prepare(`${BROWSE_SELECT} AND r.id IN (${wanted.map(() => "?").join(",")})`)
        .all(userId, ...wanted) as BrowseRomRow[];
      const order = new Map(wanted.map((id, i) => [id, i]));
      fuzzyRows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
      return { rows: [...rows, ...fuzzyRows], total: total + fuzzyRows.length };
    }
  }
  return { rows, total };
}

export interface GameVariant {
  id: number;
  title: string;
  filename: string;
  region: string | null;
  language: string | null;
  variant: string | null;
  boxart_url: string | null;
  disc_number: number | null;
  revision: string | null;
}

/** Other versions of the same game on the same system (regional releases,
 *  hacks, translations) — the copies collapsed out of the browse grid. Empty
 *  when this is the only version. */
export function gameVariants(romId: number): GameVariant[] {
  const base = getDb()
    .prepare("SELECT platform_slug, sort_title FROM roms WHERE id = ?")
    .get(romId) as { platform_slug: string; sort_title: string } | undefined;
  if (!base) return [];
  const all = getDb()
    .prepare(
      `SELECT id, title, filename, region, language, variant, boxart_url, disc_number, revision
       FROM roms
       WHERE platform_slug = ? AND sort_title = ? AND missing = 0
       ORDER BY (variant IS NULL) DESC, region, disc_number, id`
    )
    .all(base.platform_slug, base.sort_title) as GameVariant[];
  if (all.length <= 1) return [];
  // Same guard as the grid: if every copy shares the same region/language/
  // variant/disc, they're distinct games that merely parsed to one title (not
  // variants) — so there's nothing to show.
  const combos = new Set(
    all.map(
      (r) => `${r.region ?? ""}|${r.language ?? ""}|${r.variant ?? ""}|${r.disc_number ?? ""}|${r.revision ?? ""}`
    )
  );
  if (combos.size <= 1) return [];
  return all.filter((r) => r.id !== romId);
}

/** Aggressive title key for matching IGDB names to library titles: lowercase,
 *  drop parenthetical/bracket tags, articles and punctuation. "The Legend of
 *  Zelda" and "Legend of Zelda, The (USA)" both key to "legend of zelda". */
function relMatchKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/\([^)]*\)|\[[^\]]*\]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(the|a|an)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Edition/version qualifiers that distinguish the SAME game (e.g. an INTEGRAL
 *  or HD re-release) rather than a different one — so "2064 Read Only Memories"
 *  and "…INTEGRAL" count as the same game, but "Zelda" and "Zelda II" do not
 *  (a sequel numeral is not an edition word). */
const EDITION_WORDS = new Set([
  "integral", "deluxe", "definitive", "complete", "goty", "edition", "remaster",
  "remastered", "remake", "hd", "plus", "redux", "enhanced", "anniversary",
  "collection", "ultimate", "special", "premium", "gold", "director", "directors",
  "cut", "expanded", "extended", "reloaded", "classic", "legacy", "port",
]);

/** True when two title keys are the same game, allowing one to carry extra
 *  trailing edition qualifiers (INTEGRAL, HD, Definitive Edition, …). */
function sameGameKey(a: string, b: string): boolean {
  if (a === b) return true;
  const ta = a.split(" ").filter(Boolean);
  const tb = b.split(" ").filter(Boolean);
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  if (!short.length || short.length === long.length) return false;
  for (let i = 0; i < short.length; i++) if (short[i] !== long[i]) return false;
  return long.slice(short.length).every((t) => EDITION_WORDS.has(t));
}

/** Cross-reference IGDB related content against the local library: tag each
 *  game that's owned with its `romId` (so the card links into GameHub) and drop
 *  any entry that is the current game itself (incl. edition re-releases). */
export function resolveRelatedLibrary(
  related: import("./providers/igdb").IgdbRelated,
  currentTitle: string
): import("./providers/igdb").IgdbRelatedResolved {
  const curKey = relMatchKey(currentTitle);
  // Build a title → romId index over playable library entries (first wins).
  const rows = getDb()
    .prepare(
      "SELECT id, title FROM roms WHERE missing = 0 AND (disc_number IS NULL OR disc_number = 1)"
    )
    .all() as { id: number; title: string }[];
  const index = new Map<string, number>();
  for (const r of rows) {
    const k = relMatchKey(r.title);
    if (k && !index.has(k)) index.set(k, r.id);
  }
  const notCurrent = <T extends { name: string }>(g: T) => !sameGameKey(relMatchKey(g.name), curKey);
  const withId = <T extends { name: string }>(g: T) => ({ ...g, romId: index.get(relMatchKey(g.name)) });
  return {
    similar: related.similar.filter(notCurrent).map(withId),
    editions: related.editions.filter(notCurrent).map(withId),
    links: related.links,
  };
}

// ---------- User-curated (custom) game relationships ----------

/** One custom relation as shown in the management UI: the relation row id plus
 *  the OTHER game (whichever end isn't the game being viewed). */
export interface CustomRelationRow {
  id: number;
  otherRomId: number;
  otherTitle: string;
  otherBoxart: string | null;
  otherPlatform: string;
  kind: string;
}

/** Add a custom relation from `romId` → `relatedRomId` (no self-links). Ignores
 *  duplicates (the UNIQUE(rom_id, related_rom_id) constraint). Returns false when
 *  the pair already exists in either direction. */
export function addRomRelation(
  romId: number,
  relatedRomId: number,
  kind: string,
  userId: number
): boolean {
  if (romId === relatedRomId) return false;
  // Already linked either way? Treat as a no-op rather than a second row.
  const existing = getDb()
    .prepare(
      "SELECT 1 FROM rom_relations WHERE (rom_id = ? AND related_rom_id = ?) OR (rom_id = ? AND related_rom_id = ?) LIMIT 1"
    )
    .get(romId, relatedRomId, relatedRomId, romId);
  if (existing) return false;
  getDb()
    .prepare(
      "INSERT INTO rom_relations (rom_id, related_rom_id, kind, created_by) VALUES (?, ?, ?, ?)"
    )
    .run(romId, relatedRomId, kind || "Related", userId);
  return true;
}

/** Remove a custom relation by its row id. */
export function removeRomRelation(relId: number): void {
  getDb().prepare("DELETE FROM rom_relations WHERE id = ?").run(relId);
}

/** All custom relations touching `romId` (either end), each resolved to the
 *  OTHER game — for the management list. Skips relations whose other end is a
 *  missing ROM. */
export function listRomRelations(romId: number): CustomRelationRow[] {
  return getDb()
    .prepare(
      `SELECT rr.id AS id,
              other.id AS otherRomId,
              other.title AS otherTitle,
              other.boxart_url AS otherBoxart,
              other.platform_slug AS otherPlatform,
              rr.kind AS kind
       FROM rom_relations rr
       JOIN roms other
         ON other.id = CASE WHEN rr.rom_id = ? THEN rr.related_rom_id ELSE rr.rom_id END
       WHERE (rr.rom_id = ? OR rr.related_rom_id = ?) AND other.missing = 0
       ORDER BY rr.created_at DESC`
    )
    .all(romId, romId, romId) as CustomRelationRow[];
}

/** Custom relations resolved into RELATED-tab edition cards (the other game,
 *  always owned so it links inward). Merged into the IGDB editions upstream. */
export function customRelatedEditions(
  romId: number
): (import("./providers/igdb").IgdbRelatedGame & { kind: string; romId?: number })[] {
  return listRomRelations(romId).map((r) => ({
    name: r.otherTitle,
    cover: r.otherBoxart ?? undefined,
    romId: r.otherRomId,
    kind: r.kind,
  }));
}

// ---------- User-captured screenshots ----------

export interface ScreenshotInfo {
  id: number;
  width: number | null;
  height: number | null;
  created_at: string;
}

/** A user's captured screenshots for a game, newest first. */
export function listUserScreenshots(userId: number, romId: number): ScreenshotInfo[] {
  return getDb()
    .prepare(
      `SELECT id, width, height, created_at FROM screenshots
       WHERE user_id = ? AND rom_id = ? ORDER BY created_at DESC, id DESC`
    )
    .all(userId, romId) as ScreenshotInfo[];
}

// ---------- community reviews ----------

export interface ReviewRow {
  id: number;
  userId: number;
  authorName: string;
  authorAvatar: string | null;
  recommended: number; // 1 up, 0 down
  body: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface ReviewSummary {
  total: number;
  recommended: number;
  /** percent recommended (0–100), or null when there are no reviews yet */
  pct: number | null;
}

/** Aggregate recommendation for a game. */
export function reviewSummary(romId: number): ReviewSummary {
  const r = getDb()
    .prepare(
      "SELECT COUNT(*) AS total, COALESCE(SUM(recommended), 0) AS recommended FROM reviews WHERE rom_id = ?"
    )
    .get(romId) as { total: number; recommended: number };
  return {
    total: r.total,
    recommended: r.recommended,
    pct: r.total > 0 ? Math.round((r.recommended / r.total) * 100) : null,
  };
}

/** All reviews for a game (newest first), with author display info. */
export function listReviews(romId: number, limit = 100): ReviewRow[] {
  return getDb()
    .prepare(
      `SELECT rv.id AS id,
              rv.user_id AS userId,
              COALESCE(NULLIF(TRIM(u.display_name), ''), NULLIF(TRIM(u.real_name), ''), u.username) AS authorName,
              u.avatar_url AS authorAvatar,
              rv.recommended AS recommended,
              rv.body AS body,
              rv.created_at AS created_at,
              rv.updated_at AS updated_at
         FROM reviews rv
         JOIN users u ON u.id = rv.user_id
        WHERE rv.rom_id = ?
        ORDER BY rv.updated_at IS NULL DESC, COALESCE(rv.updated_at, rv.created_at) DESC
        LIMIT ?`
    )
    .all(romId, limit) as ReviewRow[];
}

/** The current user's review for a game, if any. */
export function getUserReview(userId: number, romId: number): ReviewRow | undefined {
  return getDb()
    .prepare(
      `SELECT rv.id AS id, rv.user_id AS userId,
              COALESCE(NULLIF(TRIM(u.display_name), ''), NULLIF(TRIM(u.real_name), ''), u.username) AS authorName,
              u.avatar_url AS authorAvatar,
              rv.recommended AS recommended, rv.body AS body,
              rv.created_at AS created_at, rv.updated_at AS updated_at
         FROM reviews rv JOIN users u ON u.id = rv.user_id
        WHERE rv.user_id = ? AND rv.rom_id = ?`
    )
    .get(userId, romId) as ReviewRow | undefined;
}

/** Create or update the user's review (one per user per game). */
export function upsertReview(userId: number, romId: number, recommended: boolean, body: string | null): void {
  const text = body?.trim().slice(0, 4000) || null;
  getDb()
    .prepare(
      `INSERT INTO reviews (user_id, rom_id, recommended, body)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (user_id, rom_id)
       DO UPDATE SET recommended = excluded.recommended, body = excluded.body, updated_at = datetime('now')`
    )
    .run(userId, romId, recommended ? 1 : 0, text);
}

/** Delete the user's review for a game. */
export function deleteReview(userId: number, romId: number): void {
  getDb().prepare("DELETE FROM reviews WHERE user_id = ? AND rom_id = ?").run(userId, romId);
}

// ---------- emulation compatibility ----------

export type CompatRating = "playable" | "runs" | "broken";
const COMPAT_RATINGS: CompatRating[] = ["playable", "runs", "broken"];
export function isCompatRating(v: unknown): v is CompatRating {
  return typeof v === "string" && (COMPAT_RATINGS as string[]).includes(v);
}

export interface CompatReportRow {
  id: number;
  userId: number;
  authorName: string;
  rating: CompatRating;
  note: string | null;
  updated_at: string | null;
  created_at: string;
}

export interface CompatSummary {
  /** admin-pinned rating (wins over the crowd), or null */
  official: CompatRating | null;
  counts: Record<CompatRating, number>;
  total: number;
  /** what to badge: official if set, else the crowd mode, else null (unknown) */
  consensus: CompatRating | null;
  reports: CompatReportRow[];
}

/** Aggregate emulation compatibility for a game (official + crowd reports). */
export function compatSummary(romId: number): CompatSummary {
  const db = getDb();
  const official = ((db.prepare("SELECT compat_official FROM roms WHERE id = ?").get(romId) as
    | { compat_official: string | null }
    | undefined)?.compat_official ?? null) as CompatRating | null;
  const rows = db
    .prepare(
      `SELECT cr.id AS id, cr.user_id AS userId,
              COALESCE(NULLIF(TRIM(u.display_name), ''), NULLIF(TRIM(u.real_name), ''), u.username) AS authorName,
              cr.rating AS rating, cr.note AS note, cr.updated_at AS updated_at, cr.created_at AS created_at
         FROM compat_reports cr JOIN users u ON u.id = cr.user_id
        WHERE cr.rom_id = ?
        ORDER BY COALESCE(cr.updated_at, cr.created_at) DESC`
    )
    .all(romId) as CompatReportRow[];
  const counts: Record<CompatRating, number> = { playable: 0, runs: 0, broken: 0 };
  for (const r of rows) if (isCompatRating(r.rating)) counts[r.rating]++;
  const total = rows.length;
  // Crowd mode, tie-broken toward the more optimistic rating.
  let mode: CompatRating | null = null;
  for (const r of COMPAT_RATINGS) if (counts[r] > 0 && (mode === null || counts[r] > counts[mode])) mode = r;
  return { official: isCompatRating(official) ? official : null, counts, total, consensus: (isCompatRating(official) ? official : null) ?? mode, reports: rows };
}

export function getUserCompat(userId: number, romId: number): CompatReportRow | undefined {
  return getDb()
    .prepare(
      `SELECT cr.id AS id, cr.user_id AS userId,
              COALESCE(NULLIF(TRIM(u.display_name), ''), NULLIF(TRIM(u.real_name), ''), u.username) AS authorName,
              cr.rating AS rating, cr.note AS note, cr.updated_at AS updated_at, cr.created_at AS created_at
         FROM compat_reports cr JOIN users u ON u.id = cr.user_id
        WHERE cr.user_id = ? AND cr.rom_id = ?`
    )
    .get(userId, romId) as CompatReportRow | undefined;
}

export function upsertCompatReport(userId: number, romId: number, rating: CompatRating, note: string | null): void {
  const text = note?.trim().slice(0, 2000) || null;
  getDb()
    .prepare(
      `INSERT INTO compat_reports (user_id, rom_id, rating, note) VALUES (?, ?, ?, ?)
       ON CONFLICT (user_id, rom_id)
       DO UPDATE SET rating = excluded.rating, note = excluded.note, updated_at = datetime('now')`
    )
    .run(userId, romId, rating, text);
}

export function deleteCompatReport(userId: number, romId: number): void {
  getDb().prepare("DELETE FROM compat_reports WHERE user_id = ? AND rom_id = ?").run(userId, romId);
}

/** Admin: pin (or clear, with null) the official compatibility rating. */
export function setCompatOfficial(romId: number, rating: CompatRating | null): void {
  getDb().prepare("UPDATE roms SET compat_official = ? WHERE id = ?").run(rating, romId);
}

// ---------- community guides / walkthroughs ----------

export interface GuideRow {
  id: number;
  romId: number;
  userId: number | null;
  authorName: string;
  title: string;
  body: string;
  created_at: string;
  updated_at: string | null;
}

const GUIDE_SELECT = `
  SELECT g.id AS id, g.rom_id AS romId, g.user_id AS userId,
         COALESCE(NULLIF(TRIM(u.display_name), ''), NULLIF(TRIM(u.real_name), ''), u.username, '—') AS authorName,
         g.title AS title, g.body AS body, g.created_at AS created_at, g.updated_at AS updated_at
    FROM guides g LEFT JOIN users u ON u.id = g.user_id`;

/** All guides for a game, newest-updated first. */
export function listGuides(romId: number): GuideRow[] {
  return getDb()
    .prepare(`${GUIDE_SELECT} WHERE g.rom_id = ? ORDER BY COALESCE(g.updated_at, g.created_at) DESC`)
    .all(romId) as GuideRow[];
}

export function getGuide(id: number): GuideRow | undefined {
  return getDb().prepare(`${GUIDE_SELECT} WHERE g.id = ?`).get(id) as GuideRow | undefined;
}

export function createGuide(romId: number, userId: number, title: string, body: string): number {
  const t = title.trim().slice(0, 160);
  const b = body.trim().slice(0, 40000);
  const info = getDb()
    .prepare("INSERT INTO guides (rom_id, user_id, title, body) VALUES (?, ?, ?, ?)")
    .run(romId, userId, t, b);
  return Number(info.lastInsertRowid);
}

/** Edit a guide — only the author or an admin. Returns false if not permitted. */
export function updateGuide(
  id: number,
  userId: number,
  isAdmin: boolean,
  title: string,
  body: string
): boolean {
  const row = getDb().prepare("SELECT user_id FROM guides WHERE id = ?").get(id) as
    | { user_id: number | null }
    | undefined;
  if (!row || (row.user_id !== userId && !isAdmin)) return false;
  getDb()
    .prepare("UPDATE guides SET title = ?, body = ?, updated_at = datetime('now') WHERE id = ?")
    .run(title.trim().slice(0, 160), body.trim().slice(0, 40000), id);
  return true;
}

/** Delete a guide — only the author or an admin. */
export function deleteGuide(id: number, userId: number, isAdmin: boolean): boolean {
  const row = getDb().prepare("SELECT user_id FROM guides WHERE id = ?").get(id) as
    | { user_id: number | null }
    | undefined;
  if (!row || (row.user_id !== userId && !isAdmin)) return false;
  getDb().prepare("DELETE FROM guides WHERE id = ?").run(id);
  return true;
}

// ---------- per-game emulator A/V preferences ----------

export interface EmuPrefs {
  shader: string | null;
}

/** A user's emulator A/V prefs for a game (null shader = default/disabled). */
export function getEmuPrefs(userId: number, romId: number): EmuPrefs {
  const row = getDb()
    .prepare("SELECT shader FROM emu_prefs WHERE user_id = ? AND rom_id = ?")
    .get(userId, romId) as { shader: string | null } | undefined;
  return { shader: row?.shader ?? null };
}

/** Save a user's shader choice for a game (null/'' clears it). */
export function setEmuShader(userId: number, romId: number, shader: string | null): void {
  const val = shader && shader.trim() && shader !== "disabled" ? shader.trim().slice(0, 64) : null;
  getDb()
    .prepare(
      `INSERT INTO emu_prefs (user_id, rom_id, shader) VALUES (?, ?, ?)
       ON CONFLICT (user_id, rom_id) DO UPDATE SET shader = excluded.shader`
    )
    .run(userId, romId, val);
}

// ---------- game cheats (per user, per game) ----------

export interface CheatRow {
  id: number;
  name: string;
  code: string;
  enabled: number;
  created_at: string;
}

/** A user's saved cheats for a game (newest first). */
export function listCheats(userId: number, romId: number): CheatRow[] {
  return getDb()
    .prepare(
      `SELECT id, name, code, enabled, created_at FROM game_cheats
       WHERE user_id = ? AND rom_id = ? ORDER BY created_at ASC, id ASC`
    )
    .all(userId, romId) as CheatRow[];
}

/** Add a cheat (enabled by default). Returns the new row. */
export function addCheat(
  userId: number,
  romId: number,
  name: string,
  code: string
): CheatRow {
  const cleanName = name.trim().slice(0, 80) || "Cheat";
  // Normalise the code: uppercase, strip stray spaces per line, keep newlines
  // (multi-line Game Genie/raw codes are valid).
  const cleanCode = code
    .split(/\r?\n/)
    .map((l) => l.trim().toUpperCase())
    .filter(Boolean)
    .join("\n")
    .slice(0, 400);
  // Added disabled by default — cheats (especially raw RAM codes) can break a
  // game, so the user opts in per cheat rather than having new ones apply live.
  const info = getDb()
    .prepare("INSERT INTO game_cheats (user_id, rom_id, name, code, enabled) VALUES (?, ?, ?, ?, 0)")
    .run(userId, romId, cleanName, cleanCode);
  return getDb()
    .prepare("SELECT id, name, code, enabled, created_at FROM game_cheats WHERE id = ?")
    .get(Number(info.lastInsertRowid)) as CheatRow;
}

/** Toggle a cheat on/off (scoped to the owner). */
export function setCheatEnabled(userId: number, cheatId: number, enabled: boolean): void {
  getDb()
    .prepare("UPDATE game_cheats SET enabled = ? WHERE id = ? AND user_id = ?")
    .run(enabled ? 1 : 0, cheatId, userId);
}

/** Delete a cheat (scoped to the owner). */
export function deleteCheat(userId: number, cheatId: number): void {
  getDb().prepare("DELETE FROM game_cheats WHERE id = ? AND user_id = ?").run(cheatId, userId);
}

// ---------- device pairing (QR login) ----------

export interface PairRequestRow {
  id: string;
  secret_hash: string;
  device_name: string | null;
  scope: string;
  status: "pending" | "approved" | "denied" | "consumed";
  user_id: number | null;
  token: string | null;
  created_at: string;
  expires_at: string;
}

/** Start a pairing request. Caller supplies the hashed poll secret. */
export function createPairRequest(
  id: string,
  secretHash: string,
  deviceName: string,
  scope: string,
  expiresAt: string
): void {
  getDb()
    .prepare(
      "INSERT INTO pair_requests (id, secret_hash, device_name, scope, expires_at) VALUES (?, ?, ?, ?, ?)"
    )
    .run(id, secretHash, deviceName.slice(0, 64) || "App", scope, expiresAt);
}

/** A pairing request by id (expired ones are treated as such by callers). */
export function getPairRequest(id: string): PairRequestRow | undefined {
  return getDb().prepare("SELECT * FROM pair_requests WHERE id = ?").get(id) as
    | PairRequestRow
    | undefined;
}

export function pairRequestExpired(row: PairRequestRow): boolean {
  return new Date(row.expires_at).getTime() < Date.now();
}

/** Approve a pending request: bind it to the user and store the minted token. */
export function approvePairRequest(id: string, userId: number, token: string): void {
  getDb()
    .prepare(
      "UPDATE pair_requests SET status = 'approved', user_id = ?, token = ? WHERE id = ? AND status = 'pending'"
    )
    .run(userId, token, id);
}

export function denyPairRequest(id: string): void {
  getDb()
    .prepare("UPDATE pair_requests SET status = 'denied' WHERE id = ? AND status = 'pending'")
    .run(id);
}

/** Hand the minted token to the polling app exactly once, then clear it. */
export function consumePairToken(id: string): string | null {
  const row = getPairRequest(id);
  if (!row || row.status !== "approved" || !row.token) return null;
  getDb()
    .prepare("UPDATE pair_requests SET status = 'consumed', token = NULL WHERE id = ?")
    .run(id);
  return row.token;
}

/** Housekeeping: drop expired/finished requests older than a day. */
export function purgeOldPairRequests(): void {
  getDb()
    .prepare("DELETE FROM pair_requests WHERE expires_at < datetime('now', '-1 day')")
    .run();
}

// ---------- direct messages (friend chat) ----------

export interface ChatMessage {
  id: number;
  senderId: number;
  recipientId: number;
  body: string;
  created_at: string;
  read_at: string | null;
}

export interface Conversation {
  otherId: number;
  name: string;
  avatar_url: string | null;
  presence: Presence;
  lastBody: string | null;
  lastAt: string | null;
  lastFromMe: boolean;
  unread: number;
}

/** True when two users are accepted friends (DMs are friends-only). */
export function areFriends(a: number, b: number): boolean {
  return !!getDb()
    .prepare(
      `SELECT 1 FROM friendships
        WHERE status = 'accepted'
          AND ((requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?))
        LIMIT 1`
    )
    .get(a, b, b, a);
}

/** Send a DM (friends only). Returns the new message, or null if not friends. */
export function sendMessage(fromId: number, toId: number, body: string): ChatMessage | null {
  const text = body.trim().slice(0, 4000);
  if (!text || fromId === toId || !areFriends(fromId, toId)) return null;
  const info = getDb()
    .prepare("INSERT INTO messages (sender_id, recipient_id, body) VALUES (?, ?, ?)")
    .run(fromId, toId, text);
  return getDb()
    .prepare(
      "SELECT id, sender_id AS senderId, recipient_id AS recipientId, body, created_at, read_at FROM messages WHERE id = ?"
    )
    .get(Number(info.lastInsertRowid)) as ChatMessage;
}

/** The message thread between two users (oldest → newest, capped). */
export function getThread(userId: number, otherId: number, limit = 200): ChatMessage[] {
  const rows = getDb()
    .prepare(
      `SELECT id, sender_id AS senderId, recipient_id AS recipientId, body, created_at, read_at
         FROM messages
        WHERE (sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?)
        ORDER BY id DESC LIMIT ?`
    )
    .all(userId, otherId, otherId, userId, limit) as ChatMessage[];
  return rows.reverse();
}

/** Mark all messages FROM `otherId` TO `userId` as read. */
export function markThreadRead(userId: number, otherId: number): void {
  getDb()
    .prepare(
      "UPDATE messages SET read_at = datetime('now') WHERE recipient_id = ? AND sender_id = ? AND read_at IS NULL"
    )
    .run(userId, otherId);
}

export function totalUnreadMessages(userId: number): number {
  return (
    getDb()
      .prepare("SELECT COUNT(*) AS n FROM messages WHERE recipient_id = ? AND read_at IS NULL")
      .get(userId) as { n: number }
  ).n;
}

/** Conversations for the inbox: every friend, with the last message preview and
 *  unread count. Friends you've messaged sort to the top by recency. */
export function listConversations(userId: number): Conversation[] {
  const friends = listFriends(userId);
  const db = getDb();
  const lastStmt = db.prepare(
    `SELECT body, created_at, sender_id AS senderId
       FROM messages
      WHERE (sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?)
      ORDER BY id DESC LIMIT 1`
  );
  const unreadStmt = db.prepare(
    "SELECT COUNT(*) AS n FROM messages WHERE recipient_id = ? AND sender_id = ? AND read_at IS NULL"
  );
  const convos: Conversation[] = friends.map((f) => {
    const last = lastStmt.get(userId, f.id, f.id, userId) as
      | { body: string; created_at: string; senderId: number }
      | undefined;
    const unread = (unreadStmt.get(userId, f.id) as { n: number }).n;
    return {
      otherId: f.id,
      name: f.name,
      avatar_url: f.avatar_url,
      presence: f.presence ?? "offline",
      lastBody: last?.body ?? null,
      lastAt: last?.created_at ?? null,
      lastFromMe: last ? last.senderId === userId : false,
      unread,
    };
  });
  // Conversations with messages first (newest last-message first), then the rest A→Z.
  return convos.sort((a, b) => {
    if (a.lastAt && b.lastAt) return a.lastAt < b.lastAt ? 1 : -1;
    if (a.lastAt) return -1;
    if (b.lastAt) return 1;
    return a.name.localeCompare(b.name);
  });
}

/** Split distinct comma-separated column values into a sorted token list */
function tokenFacet(column: string, platformSlug?: string): string[] {
  const h = hiddenFilter();
  const plat = platformSlug ? " AND r.platform_slug = ?" : "";
  const extra = platformSlug ? [platformSlug] : [];
  const rows = getDb()
    .prepare(
      `SELECT DISTINCT ${column} AS v FROM roms r
       WHERE r.missing = 0 AND ${column} IS NOT NULL${h.sql}${plat}`
    )
    .all(...h.params, ...extra) as { v: string }[];
  const tokens = new Set<string>();
  for (const r of rows) {
    for (const t of r.v.split(",")) {
      const s = t.trim();
      if (s) tokens.add(s);
    }
  }
  return [...tokens].sort((a, b) => a.localeCompare(b));
}

/** Distinct filter values present in the visible library (optionally one platform) */
export function browseFacets(platformSlug?: string): {
  platforms: string[];
  variants: string[];
  genres: string[];
  languages: string[];
} {
  const h = hiddenFilter();
  const db = getDb();
  const plat = platformSlug ? " AND r.platform_slug = ?" : "";
  const extra = platformSlug ? [platformSlug] : [];
  const platforms = platformSlug
    ? [platformSlug]
    : (
        db
          .prepare(
            `SELECT DISTINCT r.platform_slug AS s FROM roms r WHERE r.missing = 0${h.sql} ORDER BY s`
          )
          .all(...h.params) as { s: string }[]
      ).map((r) => r.s);
  const variants = (
    db
      .prepare(
        `SELECT DISTINCT r.variant AS v FROM roms r
         WHERE r.missing = 0 AND r.variant IS NOT NULL${h.sql}${plat} ORDER BY v`
      )
      .all(...h.params, ...extra) as { v: string }[]
  ).map((r) => r.v);
  return {
    platforms,
    variants,
    genres: tokenFacet("r.genre", platformSlug),
    languages: tokenFacet("r.language", platformSlug),
  };
}

export function listLibrary(userId: number): LibraryRomRow[] {
  const h = hiddenFilter(true, userId);
  return getDb()
    .prepare(`${LIBRARY_SELECT}${h.sql} ORDER BY r.sort_title`)
    .all(userId, ...h.params) as LibraryRomRow[];
}

/** Slim row for the home page + recommendation shelves — exactly the columns
 *  they read, no heavy text. The full LIBRARY_SELECT (`r.*`) pulls ~62 MB across
 *  the whole library; this keeps the per-visit home render cheap. */
export interface HomeLibraryRow {
  id: number;
  title: string;
  boxart_url: string | null;
  hero_url: string | null;
  screenshot_url: string | null;
  platform_slug: string;
  added_at: string | null;
  // Bumped by trigger on any metadata change; == added_at on insert. Used by the
  // home "recently updated" tier. Optional so LibraryRomRow (which lacks it) stays
  // assignable where the two row shapes are mixed (e.g. the Recent carousel).
  updated_at?: string | null;
  genre: string | null;
  rating: string | null;
  favorite: number;
  play_status: string;
  playtime_seconds: number;
  last_played_at: string | null;
}

const HOME_LIBRARY_SELECT = `
  SELECT r.id, r.title, r.boxart_url, r.hero_url, r.screenshot_url, r.platform_slug,
         r.added_at, r.updated_at, r.genre, r.rating,
         COALESCE(ur.favorite, 0) AS favorite,
         COALESCE(ur.play_status, 'none') AS play_status,
         COALESCE(ur.playtime_seconds, 0) AS playtime_seconds,
         ur.last_played_at AS last_played_at
  FROM roms r
  LEFT JOIN user_roms ur ON ur.rom_id = r.id AND ur.user_id = ?
  WHERE r.missing = 0
    -- The home page only uses games it can actually recommend/show: ones with
    -- box art, or ones the user has played. Skipping the (often large) tail of
    -- unscraped, never-played games keeps this off the full 44k-row hot path.
    AND ((r.boxart_url IS NOT NULL AND r.boxart_url <> '')
         OR ur.last_played_at IS NOT NULL
         OR ur.playtime_seconds > 0)
`;

/** Does the user have ANY visible library game at all? Cheap existence check
 *  (index-backed) for the home page's empty-library state — distinct from the
 *  art/played-filtered set listLibraryForHome returns for recommendations. */
export function libraryHasGames(userId: number): boolean {
  const h = hiddenFilter(true, userId);
  // personal hiddenFilter references ur.hidden, so it needs the user_roms join.
  const row = getDb()
    .prepare(
      `SELECT EXISTS(
         SELECT 1 FROM roms r
         LEFT JOIN user_roms ur ON ur.rom_id = r.id AND ur.user_id = ?
         WHERE r.missing = 0${h.sql}
       ) e`
    )
    .get(userId, ...h.params) as { e: number };
  return row.e === 1;
}

export function listLibraryForHome(userId: number): HomeLibraryRow[] {
  const h = hiddenFilter(true, userId);
  return getDb()
    .prepare(`${HOME_LIBRARY_SELECT}${h.sql} ORDER BY r.sort_title`)
    .all(userId, ...h.params) as HomeLibraryRow[];
}

export function getLibraryRom(userId: number, romId: number): LibraryRomRow | undefined {
  const row = getDb()
    .prepare(`${LIBRARY_SELECT} AND r.id = ?`)
    .get(userId, romId) as LibraryRomRow | undefined;
  // A restricted (kid) profile can't open a game from a disallowed system or one
  // rated above its cap, even via a direct link.
  if (row && !userCanSeeRom(userId, romId)) return undefined;
  return row;
}

export function recentlyAdded(userId: number, limit = 15): LibraryRomRow[] {
  const h = hiddenFilter(true, userId);
  return getDb()
    .prepare(`${LIBRARY_SELECT}${h.sql} ORDER BY r.added_at DESC, r.id DESC LIMIT ?`)
    .all(userId, ...h.params, limit) as LibraryRomRow[];
}

export function recentlyPlayed(userId: number, limit = 15): LibraryRomRow[] {
  const h = hiddenFilter(true, userId);
  return getDb()
    .prepare(
      `${LIBRARY_SELECT}${h.sql} AND ur.last_played_at IS NOT NULL ORDER BY ur.last_played_at DESC LIMIT ?`
    )
    .all(userId, ...h.params, limit) as LibraryRomRow[];
}

export function favorites(userId: number, limit = 30): LibraryRomRow[] {
  const h = hiddenFilter(true, userId);
  return getDb()
    .prepare(`${LIBRARY_SELECT}${h.sql} AND ur.favorite = 1 ORDER BY r.sort_title LIMIT ?`)
    .all(userId, ...h.params, limit) as LibraryRomRow[];
}

export interface FriendPlay {
  user_id: number;
  name: string;
  avatar_url: string | null;
  last_played_at: string;
  playtime_seconds: number;
}

/** Accepted friends of a game's viewer who have played it, most-recently first.
 *  Powers the "friends who've played" strip on game cards and game details. */
export function friendsWhoPlayed(
  romId: number,
  excludeUserId: number,
  limit = 12
): FriendPlay[] {
  return getDb()
    .prepare(
      `SELECT u.id AS user_id,
              COALESCE(NULLIF(TRIM(u.real_name), ''), NULLIF(TRIM(u.display_name), ''), u.username) AS name,
              u.avatar_url AS avatar_url,
              ur.last_played_at AS last_played_at,
              COALESCE(ur.playtime_seconds, 0) AS playtime_seconds
       FROM user_roms ur
       JOIN users u ON u.id = ur.user_id
       WHERE ur.rom_id = ? AND ur.user_id != ? AND ur.last_played_at IS NOT NULL
         AND ur.user_id IN (
           SELECT CASE WHEN requester_id = ? THEN addressee_id ELSE requester_id END
             FROM friendships
            WHERE status = 'accepted' AND (requester_id = ? OR addressee_id = ?)
         )
       ORDER BY ur.last_played_at DESC
       LIMIT ?`
    )
    .all(romId, excludeUserId, excludeUserId, excludeUserId, excludeUserId, limit) as FriendPlay[];
}

// ---------- presence ----------

export type Presence = "online" | "away" | "offline";

/** How recently a user must have pinged to count as present. */
const ONLINE_WINDOW_MS = 15 * 60 * 1000;

/** Record activity for a user — the heartbeat behind real online presence. Cheap
 *  enough to call on every notification poll. */
export function touchLastSeen(userId: number): void {
  try {
    getDb().prepare("UPDATE users SET last_seen = datetime('now') WHERE id = ?").run(userId);
  } catch {
    /* presence is best-effort */
  }
}

/** Derive a user's visible presence from their manual status + last activity.
 *  `invisible` always reads as offline; anything not seen within the window is
 *  offline; a manual `away` shows away while still active. */
export function presenceOf(status: string | null, lastSeen: string | null): Presence {
  if (status === "invisible") return "offline";
  if (!lastSeen) return "offline";
  const age = Date.now() - new Date(lastSeen.replace(" ", "T") + "Z").getTime();
  if (!Number.isFinite(age) || age > ONLINE_WINDOW_MS) return "offline";
  return status === "away" ? "away" : "online";
}

// ---------- now-playing (live "playing X right now") ----------

/** A play session counts as "live" only with a very recent heartbeat — the
 *  player pings every 60s, so a couple of missed beats means they've stopped
 *  (browser closed without firing the stop beacon). Tighter than presence. */
const PLAYING_WINDOW_MS = 3 * 60 * 1000;

/** Mark a user as currently playing a game (called from the play heartbeat).
 *  Also refreshes last_seen so presence stays online while playing. Stamps
 *  playing_since only when the game changes, so it reflects THIS session. */
export function setPlaying(userId: number, romId: number): void {
  try {
    getDb()
      .prepare(
        `UPDATE users
            SET playing_rom_id = ?,
                playing_since = CASE WHEN playing_rom_id = ? THEN playing_since ELSE datetime('now') END,
                last_seen = datetime('now')
          WHERE id = ?`
      )
      .run(romId, romId, userId);
  } catch {
    /* best-effort */
  }
}

/** Clear a user's now-playing (on exit / stop beacon). */
export function clearPlaying(userId: number, romId?: number): void {
  try {
    // Only clear if still on this game (avoid a stale beacon wiping a newer session).
    if (romId != null) {
      getDb()
        .prepare("UPDATE users SET playing_rom_id = NULL, playing_since = NULL WHERE id = ? AND playing_rom_id = ?")
        .run(userId, romId);
    } else {
      getDb().prepare("UPDATE users SET playing_rom_id = NULL, playing_since = NULL WHERE id = ?").run(userId);
    }
  } catch {
    /* best-effort */
  }
}

/** The game a user is playing right now (title + id), or null. Respects the
 *  live window and the Invisible status. */
export interface NowPlaying {
  romId: number;
  title: string;
  platformSlug: string;
}
export function nowPlayingFor(
  status: string | null,
  lastSeen: string | null,
  playingRomId: number | null,
  title: string | null,
  platformSlug: string | null
): NowPlaying | null {
  if (status === "invisible" || !playingRomId || !title || !lastSeen) return null;
  const age = Date.now() - new Date(lastSeen.replace(" ", "T") + "Z").getTime();
  if (!Number.isFinite(age) || age > PLAYING_WINDOW_MS) return null;
  return { romId: playingRomId, title, platformSlug: platformSlug ?? "" };
}

// ---------- friendships (mutual friend graph) ----------

export type FriendshipState = "none" | "friends" | "incoming" | "outgoing";

export interface FriendUser {
  id: number;
  name: string;
  avatar_url: string | null;
  /** ISO time the friendship was made / the request was sent. */
  since: string;
  /** Derived presence — populated for accepted friends (listFriends). */
  presence?: Presence;
  /** The game this friend is playing right now (listFriends), or null. */
  playing?: NowPlaying | null;
}

/** Accepted friend ids for a user (both directions). */
export function friendIds(userId: number): number[] {
  const rows = getDb()
    .prepare(
      `SELECT CASE WHEN requester_id = ? THEN addressee_id ELSE requester_id END AS fid
         FROM friendships
        WHERE status = 'accepted' AND (requester_id = ? OR addressee_id = ?)`
    )
    .all(userId, userId, userId) as { fid: number }[];
  return rows.map((r) => r.fid);
}

/** Relationship of `otherId` as seen by `userId`. */
export function friendshipState(userId: number, otherId: number): FriendshipState {
  if (userId === otherId) return "none";
  const row = getDb()
    .prepare(
      `SELECT requester_id, addressee_id, status FROM friendships
        WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)`
    )
    .get(userId, otherId, otherId, userId) as
    | { requester_id: number; addressee_id: number; status: string }
    | undefined;
  if (!row) return "none";
  if (row.status === "accepted") return "friends";
  return row.requester_id === userId ? "outgoing" : "incoming";
}

/** Accept a pending request sent FROM `requesterId` TO `userId`. */
export function acceptFriendRequest(userId: number, requesterId: number): boolean {
  return (
    getDb()
      .prepare(
        `UPDATE friendships SET status = 'accepted', updated_at = datetime('now')
          WHERE requester_id = ? AND addressee_id = ? AND status = 'pending'`
      )
      .run(requesterId, userId).changes > 0
  );
}

/** Send a friend request. If the other user already requested you, this accepts
 *  instead. Returns the resulting relationship state. */
export function sendFriendRequest(requesterId: number, addresseeId: number): FriendshipState {
  if (requesterId === addresseeId) return "none";
  const state = friendshipState(requesterId, addresseeId);
  if (state === "friends" || state === "outgoing") return state;
  if (state === "incoming") {
    acceptFriendRequest(requesterId, addresseeId);
    return "friends";
  }
  getDb()
    .prepare(
      `INSERT OR IGNORE INTO friendships (requester_id, addressee_id, status) VALUES (?, ?, 'pending')`
    )
    .run(requesterId, addresseeId);
  return "outgoing";
}

/** Remove any relationship between two users — unfriend, cancel, or decline. */
export function removeFriendship(userId: number, otherId: number): void {
  getDb()
    .prepare(
      `DELETE FROM friendships
        WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)`
    )
    .run(userId, otherId, otherId, userId);
}

export function listFriends(userId: number): FriendUser[] {
  const rows = getDb()
    .prepare(
      `SELECT u.id AS id,
              COALESCE(NULLIF(TRIM(u.display_name), ''), NULLIF(TRIM(u.real_name), ''), u.username) AS name,
              u.avatar_url AS avatar_url,
              u.status AS status,
              u.last_seen AS last_seen,
              u.playing_rom_id AS playing_rom_id,
              pr.title AS playing_title,
              pr.platform_slug AS playing_slug,
              COALESCE(f.updated_at, f.created_at) AS since
         FROM friendships f
         JOIN users u ON u.id = CASE WHEN f.requester_id = ? THEN f.addressee_id ELSE f.requester_id END
         LEFT JOIN roms pr ON pr.id = u.playing_rom_id AND pr.missing = 0
        WHERE f.status = 'accepted' AND (f.requester_id = ? OR f.addressee_id = ?)
        ORDER BY name COLLATE NOCASE`
    )
    .all(userId, userId, userId) as (FriendUser & {
    status: string | null;
    last_seen: string | null;
    playing_rom_id: number | null;
    playing_title: string | null;
    playing_slug: string | null;
  })[];
  // Playing friends sort to the very top, then online, away, offline.
  const rank: Record<Presence, number> = { online: 1, away: 2, offline: 3 };
  return rows
    .map(({ status, last_seen, playing_rom_id, playing_title, playing_slug, ...f }) => ({
      ...f,
      presence: presenceOf(status, last_seen),
      playing: nowPlayingFor(status, last_seen, playing_rom_id, playing_title, playing_slug),
    }))
    .sort(
      (a, b) =>
        (a.playing ? 0 : rank[a.presence!]) - (b.playing ? 0 : rank[b.presence!]) ||
        a.name.localeCompare(b.name)
    );
}

/** Pending requests others have sent to `userId` (awaiting their accept). */
export function listIncomingRequests(userId: number): FriendUser[] {
  return getDb()
    .prepare(
      `SELECT u.id AS id,
              COALESCE(NULLIF(TRIM(u.display_name), ''), u.username) AS name,
              u.avatar_url AS avatar_url, f.created_at AS since
         FROM friendships f
         JOIN users u ON u.id = f.requester_id
        WHERE f.addressee_id = ? AND f.status = 'pending'
        ORDER BY f.created_at DESC`
    )
    .all(userId) as FriendUser[];
}

/** Pending requests `userId` has sent to others (awaiting their accept). */
export function listOutgoingRequests(userId: number): FriendUser[] {
  return getDb()
    .prepare(
      `SELECT u.id AS id,
              COALESCE(NULLIF(TRIM(u.display_name), ''), u.username) AS name,
              u.avatar_url AS avatar_url, f.created_at AS since
         FROM friendships f
         JOIN users u ON u.id = f.addressee_id
        WHERE f.requester_id = ? AND f.status = 'pending'
        ORDER BY f.created_at DESC`
    )
    .all(userId) as FriendUser[];
}

/** Friends who recently accepted a request YOU sent — powers the "X accepted
 *  your friend request" notification for the original requester. They're now
 *  friends, so their real name is used. */
export function recentlyAcceptedRequests(userId: number, withinDays = 14): FriendUser[] {
  return getDb()
    .prepare(
      `SELECT u.id AS id,
              COALESCE(NULLIF(TRIM(u.real_name), ''), NULLIF(TRIM(u.display_name), ''), u.username) AS name,
              u.avatar_url AS avatar_url,
              COALESCE(f.updated_at, f.created_at) AS since
         FROM friendships f
         JOIN users u ON u.id = f.addressee_id
        WHERE f.requester_id = ? AND f.status = 'accepted'
          AND COALESCE(f.updated_at, f.created_at) >= datetime('now', ?)
        ORDER BY f.updated_at DESC`
    )
    .all(userId, `-${withinDays} days`) as FriendUser[];
}

export interface UserSearchResult {
  id: number;
  name: string;
  username: string;
  avatar_url: string | null;
}

/** Find users by username / display name for the friend finder. Excludes the
 *  searcher. `q` is matched as a case-insensitive substring. */
export function searchUsers(q: string, excludeId: number, limit = 12): UserSearchResult[] {
  const term = q.trim();
  if (!term) return [];
  // Escape LIKE wildcards so a literal % or _ in the query isn't treated as one.
  const like = `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  return getDb()
    .prepare(
      `SELECT id,
              COALESCE(NULLIF(TRIM(display_name), ''), username) AS name,
              username, avatar_url
         FROM users
        WHERE id != ?
          AND (username LIKE ? ESCAPE '\\' OR COALESCE(display_name, '') LIKE ? ESCAPE '\\')
        ORDER BY name COLLATE NOCASE
        LIMIT ?`
    )
    .all(excludeId, like, like, limit) as UserSearchResult[];
}

// ---------- smart collections ----------

/** Fixed filter fields (not a rule engine): values within a field OR/AND per
 *  its _logic; different fields always AND. Inclusion-only, no negation. */
export interface SmartFilters {
  platforms?: string[];
  genres?: string[];
  genres_logic?: "any" | "all";
  languages?: string[];
  languages_logic?: "any" | "all";
  variants?: string[]; // "main" plus variant names
  game_modes?: string[]; // "Single player" | "Multiplayer" | "Co-operative"
  statuses?: string[]; // none | backlog | playing | beaten | dropped
  search_term?: string;
  playable?: boolean;
}

const SMART_STATUSES = ["none", "backlog", "playing", "beaten", "dropped"];

export function sanitizeSmartFilters(raw: unknown): SmartFilters {
  const src = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const strArr = (v: unknown) =>
    Array.isArray(v)
      ? [
          ...new Set(
            v
              .filter((x): x is string => typeof x === "string" && !!x.trim())
              .map((x) => x.trim())
          ),
        ].slice(0, 60)
      : [];
  const out: SmartFilters = {};
  const platforms = strArr(src.platforms);
  if (platforms.length) out.platforms = platforms;
  const genres = strArr(src.genres);
  if (genres.length) {
    out.genres = genres;
    out.genres_logic = src.genres_logic === "all" ? "all" : "any";
  }
  const languages = strArr(src.languages);
  if (languages.length) {
    out.languages = languages;
    out.languages_logic = src.languages_logic === "all" ? "all" : "any";
  }
  const variants = strArr(src.variants);
  if (variants.length) out.variants = variants;
  const gameModes = strArr(src.game_modes);
  if (gameModes.length) out.game_modes = gameModes;
  const statuses = strArr(src.statuses).filter((s) => SMART_STATUSES.includes(s));
  if (statuses.length) out.statuses = statuses;
  if (typeof src.search_term === "string" && src.search_term.trim()) {
    out.search_term = src.search_term.trim().slice(0, 100);
  }
  if (src.playable === true) out.playable = true;
  return out;
}

function smartWhere(filters: SmartFilters): { sql: string; params: (string | number)[] } {
  const conds: string[] = [];
  const params: (string | number)[] = [];
  if (filters.platforms?.length) {
    conds.push(`r.platform_slug IN (${filters.platforms.map(() => "?").join(",")})`);
    params.push(...filters.platforms);
  }
  if (filters.playable) {
    const slugs = PLATFORMS_SORTED.filter((p) => platformPlayable(p)).map((p) => p.slug);
    conds.push(`r.platform_slug IN (${slugs.map(() => "?").join(",")})`);
    params.push(...slugs);
  }
  if (filters.genres?.length) {
    const parts = filters.genres.map(() => tokenCond("r.genre"));
    conds.push(`(${parts.join(filters.genres_logic === "all" ? " AND " : " OR ")})`);
    params.push(...filters.genres);
  }
  if (filters.languages?.length) {
    const parts = filters.languages.map(() => tokenCond("r.language"));
    conds.push(`(${parts.join(filters.languages_logic === "all" ? " AND " : " OR ")})`);
    params.push(...filters.languages);
  }
  if (filters.variants?.length) {
    const orParts: string[] = [];
    const named = filters.variants.filter((v) => v !== "main");
    if (filters.variants.includes("main")) orParts.push("r.variant IS NULL");
    if (named.length) {
      orParts.push(`r.variant IN (${named.map(() => "?").join(",")})`);
      params.push(...named);
    }
    conds.push(`(${orParts.join(" OR ")})`);
  }
  if (filters.game_modes?.length) {
    conds.push(`(${filters.game_modes.map(() => tokenCond("r.game_modes")).join(" OR ")})`);
    params.push(...filters.game_modes);
  }
  if (filters.statuses?.length) {
    conds.push(
      `COALESCE(ur.play_status, 'none') IN (${filters.statuses.map(() => "?").join(",")})`
    );
    params.push(...filters.statuses);
  }
  if (filters.search_term) {
    conds.push("r.title LIKE ?");
    params.push(`%${filters.search_term}%`);
  }
  return { sql: conds.length ? ` AND ${conds.join(" AND ")}` : "", params };
}

/** Membership is computed at read time, so smart collections are always in
 *  sync with scans, metadata edits, and (viewer's own) play statuses. */
export function listSmartCollectionRoms(
  userId: number,
  filters: SmartFilters,
  limit = 5000
): BrowseRomRow[] {
  const h = hiddenFilter(true, userId);
  const w = smartWhere(filters);
  return getDb()
    .prepare(`${BROWSE_SELECT}${h.sql}${w.sql} ORDER BY r.sort_title LIMIT ?`)
    .all(userId, ...h.params, ...w.params, limit) as BrowseRomRow[];
}

export function countSmartCollection(userId: number, filters: SmartFilters): number {
  const h = hiddenFilter(true, userId);
  const w = smartWhere(filters);
  return (
    getDb()
      .prepare(
        `SELECT COUNT(*) c FROM roms r
         LEFT JOIN user_roms ur ON ur.rom_id = r.id AND ur.user_id = ?
         WHERE r.missing = 0${h.sql}${w.sql}`
      )
      .get(userId, ...h.params, ...w.params) as { c: number }
  ).c;
}

export function parseSmartFilters(json: string | null): SmartFilters {
  if (!json) return {};
  try {
    return sanitizeSmartFilters(JSON.parse(json));
  } catch {
    return {};
  }
}

/** A collection surfaced as a library tab (Steam's library collection tabs).
 *  `count` is live for smart collections, hand-picked otherwise. */
export interface LibraryCollectionTab {
  id: number;
  name: string;
  is_smart: number;
  count: number;
  /** A few cover URLs for the collage tile (up to 4) */
  covers: string[];
}

/** The user's collections (own + public), with live counts + a few covers each,
 *  for the library tab strip + Collections view. "All Games" is implicit and
 *  added client-side. */
export function listLibraryCollections(userId: number): LibraryCollectionTab[] {
  const db = getDb();
  const cols = db
    .prepare(
      `SELECT c.*, COUNT(ci.rom_id) AS item_count
       FROM collections c
       LEFT JOIN collection_items ci ON ci.collection_id = c.id
       WHERE c.user_id = ? OR c.is_public = 1
       GROUP BY c.id ORDER BY c.name`
    )
    .all(userId) as (CollectionRow & { item_count: number })[];

  // Collage covers: standard collections in one windowed query; smart ones
  // resolve their live membership (same approach as the Collections page).
  const covers = new Map<number, string[]>();
  const standardIds = cols.filter((c) => c.is_smart !== 1).map((c) => c.id);
  if (standardIds.length > 0) {
    const rows = db
      .prepare(
        `SELECT collection_id, boxart_url FROM (
           SELECT ci.collection_id, r.boxart_url,
             ROW_NUMBER() OVER (PARTITION BY ci.collection_id ORDER BY r.sort_title) AS rn
           FROM collection_items ci
           JOIN roms r ON r.id = ci.rom_id AND r.missing = 0
           WHERE r.boxart_url IS NOT NULL AND r.boxart_url <> ''
             AND ci.collection_id IN (${standardIds.map(() => "?").join(",")})
         ) WHERE rn <= 4`
      )
      .all(...standardIds) as { collection_id: number; boxart_url: string }[];
    for (const r of rows) {
      const arr = covers.get(r.collection_id) ?? [];
      arr.push(r.boxart_url);
      covers.set(r.collection_id, arr);
    }
  }
  for (const c of cols) {
    if (c.is_smart === 1) {
      const art = listSmartCollectionRoms(userId, parseSmartFilters(c.filters), 4)
        .map((r) => r.boxart_url)
        .filter((u): u is string => !!u);
      if (art.length) covers.set(c.id, art);
    }
  }

  return cols.map((c) => ({
    id: c.id,
    name: c.name,
    is_smart: c.is_smart,
    count:
      c.is_smart === 1
        ? countSmartCollection(userId, parseSmartFilters(c.filters))
        : c.item_count ?? 0,
    covers: covers.get(c.id) ?? [],
  }));
}

// ---------- virtual collections ----------

/** Auto-generated groupings by metadata dimension — read-only, computed live */
export type VirtualDimension = "genre" | "developer" | "publisher";

export const VIRTUAL_DIMENSIONS: VirtualDimension[] = ["genre", "developer", "publisher"];

/** Groups with fewer games than this are suppressed */
export const VIRTUAL_MIN_COUNT = 5;

export function listVirtualCollections(
  minCount = VIRTUAL_MIN_COUNT
): Record<VirtualDimension, { value: string; count: number }[]> {
  const h = hiddenFilter();
  const db = getDb();
  const out: Record<VirtualDimension, { value: string; count: number }[]> = {
    genre: [],
    developer: [],
    publisher: [],
  };

  // Genre is comma-separated — split combos into tokens and aggregate
  const genreRows = db
    .prepare(
      `SELECT r.genre AS v, COUNT(*) AS c FROM roms r
       WHERE r.missing = 0 AND r.genre IS NOT NULL${h.sql} GROUP BY r.genre`
    )
    .all(...h.params) as { v: string; c: number }[];
  const genreCounts = new Map<string, number>();
  for (const row of genreRows) {
    for (const t of row.v.split(",")) {
      const token = t.trim();
      if (token) genreCounts.set(token, (genreCounts.get(token) ?? 0) + row.c);
    }
  }
  out.genre = [...genreCounts.entries()]
    .filter(([, c]) => c >= minCount)
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));

  for (const dim of ["developer", "publisher"] as const) {
    out[dim] = (
      db
        .prepare(
          `SELECT r.${dim} AS v, COUNT(*) AS c FROM roms r
           WHERE r.missing = 0 AND r.${dim} IS NOT NULL${h.sql}
           GROUP BY r.${dim} COLLATE NOCASE HAVING c >= ? ORDER BY c DESC, v`
        )
        .all(...h.params, minCount) as { v: string; c: number }[]
    ).map((r) => ({ value: r.v, count: r.c }));
  }
  return out;
}

function virtualCond(dimension: VirtualDimension): string {
  return dimension === "genre" ? tokenCond("r.genre") : `r.${dimension} = ? COLLATE NOCASE`;
}

export function listVirtualCollectionRoms(
  userId: number,
  dimension: VirtualDimension,
  value: string,
  limit = 1000
): BrowseRomRow[] {
  const h = hiddenFilter(true, userId);
  return getDb()
    .prepare(
      `${BROWSE_SELECT}${h.sql} AND ${virtualCond(dimension)} ORDER BY r.sort_title LIMIT ?`
    )
    .all(userId, ...h.params, value, limit) as BrowseRomRow[];
}

export function countVirtualCollection(dimension: VirtualDimension, value: string): number {
  const h = hiddenFilter();
  return (
    getDb()
      .prepare(
        `SELECT COUNT(*) c FROM roms r WHERE r.missing = 0${h.sql} AND ${virtualCond(dimension)}`
      )
      .get(...h.params, value) as { c: number }
  ).c;
}

// ---------- admin user management ----------

export interface AdminUserRow {
  id: number;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  is_admin: number;
  role: string | null;
  created_at: string;
  playtime_seconds: number;
  collections: number;
  last_played_at: string | null;
  /** Assigned restriction profile id, or null = unrestricted */
  restriction_profile_id: number | null;
  /** Assigned restriction profile name, or null (for display) */
  restriction_profile_name: string | null;
}

export function listUsersAdmin(): AdminUserRow[] {
  return getDb()
    .prepare(
      `SELECT u.id, u.username, u.display_name, u.avatar_url, u.is_admin, u.role, u.created_at,
              u.restriction_profile_id,
              (SELECT name FROM restriction_profiles WHERE id = u.restriction_profile_id) AS restriction_profile_name,
              COALESCE((SELECT SUM(playtime_seconds) FROM user_roms WHERE user_id = u.id), 0) AS playtime_seconds,
              (SELECT COUNT(*) FROM collections WHERE user_id = u.id) AS collections,
              (SELECT MAX(last_played_at) FROM user_roms WHERE user_id = u.id) AS last_played_at
       FROM users u ORDER BY u.created_at, u.id`
    )
    .all() as AdminUserRow[];
}

export function ensureUserRom(userId: number, romId: number) {
  getDb()
    .prepare("INSERT OR IGNORE INTO user_roms (user_id, rom_id) VALUES (?, ?)")
    .run(userId, romId);
}
