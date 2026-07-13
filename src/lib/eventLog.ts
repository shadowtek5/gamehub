// System-wide operational / audit event log. Backs the admin-only live Activity
// Log at /activity: scans, scrapes, user & auth changes, settings edits and
// maintenance actions, each attributed to the actor who triggered it. This is
// deliberately separate from the per-user/per-game `activity` table (see
// lib/activity.ts) — those are game feed entries; these are system events.
//
// logEvent() must NEVER throw into its callers: a logging failure must not break
// a scan, a scrape, or a settings save. Every write is wrapped in try/catch.

import { getDb } from "./db";
import type { SessionUser } from "./auth";

export type EventCategory =
  | "scan"
  | "scrape"
  | "user"
  | "auth"
  | "settings"
  | "maintenance"
  | "system";

export type EventSeverity = "info" | "warn" | "error";

/** An actor is either a signed-in user or `null` for automatic/scheduled work. */
export type EventActor = SessionUser | { id: number; name: string } | null | undefined;

export interface EventRow {
  id: number;
  created_at: string;
  category: EventCategory;
  action: string;
  severity: EventSeverity;
  actor_id: number | null;
  actor_name: string | null;
  summary: string;
  /** Parsed from the stored JSON; null when absent or unparseable. */
  detail: Record<string, unknown> | null;
}

interface LogEventInput {
  category: EventCategory;
  /** Dotted action id, e.g. "scan.completed", "user.created". */
  action: string;
  summary: string;
  detail?: Record<string, unknown> | null;
  severity?: EventSeverity;
  actor?: EventActor;
}

/** Normalize the various actor shapes to { id, name } | null. */
function resolveActor(actor: EventActor): { id: number | null; name: string | null } {
  if (!actor) return { id: null, name: null };
  const id = actor.id ?? null;
  // SessionUser has `username`; the light shape has `name`.
  const name =
    "name" in actor && actor.name
      ? actor.name
      : "username" in actor && actor.username
        ? actor.username
        : null;
  return { id, name };
}

// Retention: events older than this are purged automatically. Also keep a hard
// row cap as a burst-safety backstop below the age limit.
export const RETENTION_DAYS = 30;
const RETAIN = 10_000;
const TRIM_EVERY = 200;
let sinceTrim = 0;
let lastPurge = 0;

/** Delete events past the retention window. Throttled to once/hour unless forced,
 *  so it can be called cheaply from hot paths (logging, reads). Best-effort. */
export function purgeExpired(force = false): void {
  const now = Date.now();
  if (!force && now - lastPurge < 3_600_000) return;
  lastPurge = now;
  try {
    getDb()
      .prepare("DELETE FROM event_log WHERE created_at < datetime('now', ?)")
      .run(`-${RETENTION_DAYS} days`);
  } catch {
    /* best-effort */
  }
}

function maybeTrim(): void {
  if (++sinceTrim < TRIM_EVERY) return;
  sinceTrim = 0;
  purgeExpired();
  try {
    getDb()
      .prepare(
        `DELETE FROM event_log WHERE id <= (
           SELECT id FROM event_log ORDER BY id DESC LIMIT 1 OFFSET ?
         )`
      )
      .run(RETAIN);
  } catch {
    /* trimming is best-effort */
  }
}

/** Resolve a bare user id to an actor with a display name (for callers that only
 *  carry the numeric id, e.g. the scrape job's `initiatedBy`). Null when there's
 *  no id (automatic/scheduled work). */
export function lookupActor(id: number | null | undefined): { id: number; name: string } | null {
  if (id == null) return null;
  try {
    const row = getDb().prepare("SELECT username FROM users WHERE id = ?").get(id) as
      | { username: string }
      | undefined;
    return { id, name: row?.username ?? `#${id}` };
  } catch {
    return { id, name: `#${id}` };
  }
}

/** Record one system event. Returns the new row id, or 0 on failure. */
export function logEvent(input: LogEventInput): number {
  try {
    const { id, name } = resolveActor(input.actor);
    const info = getDb()
      .prepare(
        `INSERT INTO event_log (category, action, severity, actor_id, actor_name, summary, detail)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.category,
        input.action,
        input.severity ?? "info",
        id,
        name,
        input.summary,
        input.detail ? JSON.stringify(input.detail) : null
      );
    maybeTrim();
    return Number(info.lastInsertRowid);
  } catch {
    // Never let logging break the operation being logged.
    return 0;
  }
}

interface ListEventsOptions {
  category?: EventCategory | null;
  /** Restrict to these severities (e.g. ["warn","error"] for the notification bell). */
  severities?: EventSeverity[] | null;
  /** Return only rows with id > since (the live tail). */
  since?: number | null;
  /** Return only rows with id < before (load older). */
  before?: number | null;
  limit?: number;
}

interface EventDbRow {
  id: number;
  created_at: string;
  category: EventCategory;
  action: string;
  severity: EventSeverity;
  actor_id: number | null;
  actor_name: string | null;
  summary: string;
  detail: string | null;
}

function mapRow(r: EventDbRow): EventRow {
  let detail: Record<string, unknown> | null = null;
  if (r.detail) {
    try {
      detail = JSON.parse(r.detail);
    } catch {
      detail = null;
    }
  }
  return { ...r, detail };
}

/** Events newest-first. Cursor by id: `since` for new rows, `before` for older. */
export function listEvents(opts: ListEventsOptions = {}): EventRow[] {
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500);
  const where: string[] = [];
  const params: unknown[] = [];
  if (opts.category) {
    where.push("category = ?");
    params.push(opts.category);
  }
  if (opts.severities && opts.severities.length) {
    where.push(`severity IN (${opts.severities.map(() => "?").join(",")})`);
    params.push(...opts.severities);
  }
  if (opts.since != null) {
    where.push("id > ?");
    params.push(opts.since);
  }
  if (opts.before != null) {
    where.push("id < ?");
    params.push(opts.before);
  }
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const rows = getDb()
    .prepare(
      `SELECT id, created_at, category, action, severity, actor_id, actor_name, summary, detail
       FROM event_log ${clause} ORDER BY id DESC LIMIT ?`
    )
    .all(...params, limit) as EventDbRow[];
  return rows.map(mapRow);
}

export interface EventCounts {
  total: number;
  byCategory: Record<string, number>;
}

/** Row counts per category (+ total) across the whole log — for the filter chips. */
export function eventCounts(): EventCounts {
  const rows = getDb()
    .prepare("SELECT category, COUNT(*) AS c FROM event_log GROUP BY category")
    .all() as { category: string; c: number }[];
  const byCategory: Record<string, number> = {};
  let total = 0;
  for (const r of rows) {
    byCategory[r.category] = r.c;
    total += r.c;
  }
  return { total, byCategory };
}

/** Every event, newest-first (no paging cap) — for the JSON export/backup. */
export function allEvents(): EventRow[] {
  const rows = getDb()
    .prepare(
      `SELECT id, created_at, category, action, severity, actor_id, actor_name, summary, detail
       FROM event_log ORDER BY id DESC`
    )
    .all() as EventDbRow[];
  return rows.map(mapRow);
}

/** Delete log rows. `olderThanDays` (>0) keeps recent rows; otherwise clears all.
 *  Returns how many rows were removed. */
export function clearEvents(opts: { olderThanDays?: number } = {}): number {
  try {
    if (opts.olderThanDays && opts.olderThanDays > 0) {
      return getDb()
        .prepare("DELETE FROM event_log WHERE created_at < datetime('now', ?)")
        .run(`-${Math.floor(opts.olderThanDays)} days`).changes;
    }
    return getDb().prepare("DELETE FROM event_log").run().changes;
  } catch {
    return 0;
  }
}
