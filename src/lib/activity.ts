import fs from "fs";
import path from "path";
import { getDb } from "./db";

// Per-user activity feed. When an event changes artwork, we snapshot the image
// to data/activity/<gameId>/<id>.<ext> so the entry keeps its picture for
// display even after the game's live art changes again.

const ACTIVITY_DIR = path.join(process.cwd(), "data", "activity");

/** Absolute path to a snapshot file, grouped by game id (`_` when none). */
export function activityImagePath(romId: number | null, id: number, ext: string): string {
  return path.join(ACTIVITY_DIR, String(romId ?? "_"), `${id}.${ext}`);
}

export interface ActivityRow {
  id: number;
  user_id: number;
  rom_id: number | null;
  type: string;
  summary: string;
  detail: string | null;
  image_ext: string | null;
  created_at: string;
  // joined from users — the creator of the event
  actor_name: string | null;
  actor_avatar: string | null;
}

/** The public URL for an activity entry's snapshot image (or null). */
export function activityImageUrl(row: Pick<ActivityRow, "id" | "image_ext">): string | null {
  return row.image_ext ? `/api/activity/${row.id}/image` : null;
}

/**
 * Record an activity entry. If `imageSourcePath` points to an existing file it
 * is copied into the activity store as this entry's snapshot (best-effort).
 * Returns the new row id.
 */
export function logActivity(opts: {
  userId: number;
  romId?: number | null;
  type: string;
  summary: string;
  detail?: string | null;
  imageSourcePath?: string | null;
}): number {
  let ext: string | null = null;
  if (opts.imageSourcePath && fs.existsSync(opts.imageSourcePath)) {
    ext = path.extname(opts.imageSourcePath).replace(/^\./, "").toLowerCase() || "png";
  }

  const info = getDb()
    .prepare(
      "INSERT INTO activity (user_id, rom_id, type, summary, detail, image_ext) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .run(opts.userId, opts.romId ?? null, opts.type, opts.summary, opts.detail ?? null, ext);
  const id = Number(info.lastInsertRowid);

  if (ext && opts.imageSourcePath) {
    try {
      const dest = activityImagePath(opts.romId ?? null, id, ext);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(opts.imageSourcePath, dest);
    } catch {
      // snapshot is best-effort — clear the ext so the UI doesn't 404
      getDb().prepare("UPDATE activity SET image_ext = NULL WHERE id = ?").run(id);
    }
  }
  return id;
}

/**
 * A game's activity feed (newest first) — every user's events, each attributed
 * to its creator via a users join. Tracking stays per-user (the user_id column);
 * the feed simply shows who did what.
 */
export function getRomActivity(romId: number, limit = 50): ActivityRow[] {
  return getDb()
    .prepare(
      // 'played' entries are no longer written (play history lives on
      // user_roms); exclude any legacy ones so the feed isn't flooded.
      `SELECT a.*, u.username AS actor_name, u.avatar_url AS actor_avatar
       FROM activity a
       LEFT JOIN users u ON u.id = a.user_id
       WHERE a.rom_id = ? AND a.type != 'played'
       ORDER BY a.created_at DESC, a.id DESC
       LIMIT ?`
    )
    .all(romId, limit) as ActivityRow[];
}
