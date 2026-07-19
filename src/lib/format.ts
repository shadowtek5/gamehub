export function formatPlaytime(seconds: number): string {
  if (seconds <= 0) return "";
  const hours = seconds / 3600;
  if (hours >= 1) return `${hours.toFixed(1)} hrs`;
  return `${Math.max(1, Math.round(seconds / 60))} min`;
}

/** Human-readable, locale-aware duration for ETAs — e.g. "1 hr 20 min",
 *  "5 min 30 sec", "45 sec". Shows at most the two largest non-zero units. Units
 *  are localized via Intl (no per-language strings needed). */
export function formatDurationShort(locale: string, totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const unit = (n: number, u: "hour" | "minute" | "second") =>
    new Intl.NumberFormat(locale, { style: "unit", unit: u, unitDisplay: "short" }).format(n);
  const parts: string[] = [];
  if (h > 0) {
    parts.push(unit(h, "hour"));
    if (m > 0) parts.push(unit(m, "minute"));
  } else if (m > 0) {
    parts.push(unit(m, "minute"));
    if (sec > 0) parts.push(unit(sec, "second"));
  } else {
    parts.push(unit(Math.max(1, sec), "second"));
  }
  return parts.join(" ");
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1 << 30) return `${(bytes / (1 << 30)).toFixed(2)} GB`;
  if (bytes >= 1 << 20) return `${(bytes / (1 << 20)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Compact "time ago" for play-history timestamps (SQLite UTC "YYYY-MM-DD
 *  HH:MM:SS"). Server-rendered on force-dynamic pages, so it's evaluated fresh
 *  per request. Returns "just now", "5m", "3h", "2d", "3w", "5mo", "2y". */
export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "";
  const then = new Date(iso.replace(" ", "T") + (iso.includes("Z") ? "" : "Z")).getTime();
  if (Number.isNaN(then)) return "";
  const s = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (s < 45) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  const w = Math.floor(d / 7);
  if (d < 30) return `${w}w ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(d / 365)}y ago`;
}

export const PLAY_STATUS_LABELS: Record<string, string> = {
  none: "Not set",
  backlog: "Backlog",
  playing: "Playing",
  beaten: "Beaten",
  dropped: "Dropped",
};
