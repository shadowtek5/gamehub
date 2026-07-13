"use client";

// SteamOS Edit Profile: left sidebar of categories, right pane per category
// (General / Avatar / Profile Background / Theme / Featured Badge).

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ProfileBadge } from "@/lib/profile";
import BadgeIcon from "./BadgeIcon";
import RetroAchievementsLink from "./RetroAchievementsLink";
import { playSound } from "@/lib/sounds";
import { GpButton } from "@/components/bpm/primitives";

export interface ProfileEditData {
  id: number;
  username: string;
  display_name: string | null;
  real_name: string | null;
  location: string | null;
  avatar_url: string | null;
  background_url: string | null;
  theme: string | null;
  featured_badge: string | null;
}

const CATEGORIES = [
  { key: "general", label: "General" },
  { key: "avatar", label: "Avatar" },
  { key: "background", label: "Profile Background" },
  { key: "theme", label: "Theme" },
  { key: "badge", label: "Featured Badge" },
  { key: "connections", label: "Connections" },
] as const;

const THEME_OPTIONS = [
  { key: "default", name: "Default Theme", swatch: "linear-gradient(160deg,#3a4654,#20262e)" },
  { key: "summer", name: "Summer", swatch: "linear-gradient(160deg,#e0a422,#8a5c0a)" },
  { key: "midnight", name: "Midnight", swatch: "linear-gradient(160deg,#0b0e17,#04050a)" },
];

export default function ProfileEdit({
  user,
  badges,
  backgrounds,
  backHref = "/profile",
}: {
  user: ProfileEditData;
  badges: ProfileBadge[];
  backgrounds: { url: string; title: string }[];
  /** where "Back to Your Profile" points (mobile routes override this) */
  backHref?: string;
}) {
  const [cat, setCat] = useState<string>("general");
  const [displayName, setDisplayName] = useState(user.display_name ?? "");
  const [realName, setRealName] = useState(user.real_name ?? "");
  const [location, setLocation] = useState(user.location ?? "");
  const [avatar, setAvatar] = useState(user.avatar_url);
  const [background, setBackground] = useState(user.background_url);
  const [theme, setTheme] = useState(user.theme ?? "default");
  const [badge, setBadge] = useState(user.featured_badge);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const t = useTranslations("profileComps.profileEdit");

  // Profile-background picker: search + infinite scroll over ALL hero art.
  // Seeded with the server's initial candidates, then driven by the API.
  const [bgItems, setBgItems] = useState<{ url: string; title: string }[]>(backgrounds);
  const [bgQuery, setBgQuery] = useState("");
  const [bgHasMore, setBgHasMore] = useState(true);
  const [bgLoading, setBgLoading] = useState(false);
  const bgSentinel = useRef<HTMLDivElement | null>(null);

  const fetchBgPage = useCallback(async (query: string, offset: number) => {
    setBgLoading(true);
    try {
      const res = await fetch(
        `/api/profile/backgrounds?q=${encodeURIComponent(query)}&offset=${offset}`
      );
      const data = await res.json();
      const incoming: { url: string; title: string }[] = data.items ?? [];
      setBgItems((prev) => {
        const base = offset === 0 ? [] : prev;
        const seen = new Set(base.map((b) => b.url));
        const merged = [...base];
        for (const it of incoming) {
          if (!seen.has(it.url)) {
            seen.add(it.url);
            merged.push(it);
          }
        }
        return merged;
      });
      setBgHasMore(!!data.hasMore);
    } finally {
      setBgLoading(false);
    }
  }, []);

  // (Re)load page 0 when the search term changes or the tab is opened.
  useEffect(() => {
    if (cat !== "background") return;
    const t = setTimeout(() => void fetchBgPage(bgQuery, 0), 250);
    return () => clearTimeout(t);
  }, [bgQuery, cat, fetchBgPage]);

  // Load the next page when the sentinel scrolls into view.
  useEffect(() => {
    if (cat !== "background") return;
    const el = bgSentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && bgHasMore && !bgLoading) {
          void fetchBgPage(bgQuery, bgItems.length);
        }
      },
      { rootMargin: "400px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [cat, bgHasMore, bgLoading, bgQuery, bgItems.length, fetchBgPage]);

  async function patch(body: Record<string, unknown>, okMsg = t("saved")) {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      setMsg(res.ok ? okMsg : `✗ ${data.error ?? t("failed")}`);
      if (res.ok) {
        playSound("confirm");
        router.refresh();
      }
      return res.ok;
    } finally {
      setBusy(false);
    }
  }

  async function upload(type: "avatar" | "background", file: File | null) {
    if (!file) return;
    setBusy(true);
    setMsg(t("uploading"));
    try {
      const form = new FormData();
      form.append("type", type);
      form.append("file", file);
      const res = await fetch("/api/profile/media", { method: "POST", body: form });
      const data = await res.json();
      if (res.ok) {
        if (type === "avatar") setAvatar(data.url);
        else setBackground(data.url);
        setMsg(t("uploaded"));
        playSound("confirm");
        router.refresh();
      } else {
        setMsg(`✗ ${data.error ?? t("uploadFailed")}`);
      }
    } finally {
      setBusy(false);
    }
  }

  const pickingBgRef = useRef(false);
  async function pickBackground(url: string | null) {
    if (pickingBgRef.current) return; // ignore double-clicks while applying
    pickingBgRef.current = true;
    setBackground(url);
    try {
      await patch({ background_url: url }, url ? t("backgroundSet") : t("backgroundRemoved"));
    } finally {
      pickingBgRef.current = false;
    }
  }

  const avatarBox = (size: string, label: string) => (
    <div className="flex flex-col items-center gap-2">
      {avatar ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatar} alt="" className={`${size} rounded-[3px] object-cover ring-1 ring-white/25`} />
      ) : (
        <div
          className={`${size} flex items-center justify-center rounded-[3px] bg-accent/20 font-black text-accent ring-1 ring-white/25`}
        >
          {(displayName || user.username).slice(0, 1).toUpperCase()}
        </div>
      )}
      <span className="text-xs text-dim">{label}</span>
    </div>
  );

  return (
    <div className="flex min-h-[75vh] flex-col gap-8 md:flex-row">
      {/* Sidebar */}
      <nav className="w-full shrink-0 md:w-64">
        <Link
          href={backHref}
          className="menu-item mb-4 whitespace-nowrap rounded-[3px] !py-3 text-[15px]"
        >
          {t("backToProfile")}
        </Link>
        <div className="flex flex-row gap-1 overflow-x-auto md:flex-col">
          {CATEGORIES.map((c) => (
            <button
              key={c.key}
              onClick={() => {
                playSound("tab");
                setMsg("");
                setCat(c.key);
              }}
              className={`menu-item whitespace-nowrap rounded-[3px] !py-3 text-[15px] ${cat === c.key ? "bg-white/10" : ""}`}
              style={cat === c.key ? { boxShadow: "inset 4px 0 0 var(--accent)" } : undefined}
            >
              {t(`categories.${c.key}`)}
            </button>
          ))}
        </div>
      </nav>

      {/* Content */}
      <div className="min-w-0 flex-1">
        {cat === "general" && (
          <>
            <h2 className="text-2xl font-bold text-bright">{t("aboutHeading")}</h2>
            <p className="mb-6 mt-1 text-sm text-dim">
              {t("aboutDesc")}
            </p>
            <div className="flex max-w-2xl flex-col gap-5">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-bold uppercase tracking-widest text-dim">{t("profileName")}</span>
                <input
                  className="input-dark px-3 py-2.5 text-[15px]"
                  value={displayName}
                  maxLength={64}
                  placeholder={user.username}
                  onChange={(e) => setDisplayName(e.target.value)}
                  autoComplete="off"
                  data-form-type="other"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-bold uppercase tracking-widest text-dim">{t("realName")}</span>
                <input
                  className="input-dark px-3 py-2.5 text-[15px]"
                  value={realName}
                  maxLength={64}
                  onChange={(e) => setRealName(e.target.value)}
                  autoComplete="off"
                  data-form-type="other"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-bold uppercase tracking-widest text-dim">{t("location")}</span>
                <input
                  className="input-dark px-3 py-2.5 text-[15px]"
                  value={location}
                  maxLength={64}
                  placeholder={t("locationPlaceholder")}
                  onChange={(e) => setLocation(e.target.value)}
                  autoComplete="off"
                  data-form-type="other"
                />
              </label>
              <div className="text-xs text-dim">
                {t("profileUrlNote", { id: user.id })}
              </div>
              <GpButton
                primary
                onClick={() =>
                  patch({
                    display_name: displayName.trim() || null,
                    real_name: realName.trim() || null,
                    location: location.trim() || null,
                  })
                }
                disabled={busy}
                className="w-fit"
              >
                {t("save")}
              </GpButton>
            </div>
          </>
        )}

        {cat === "avatar" && (
          <>
            <h2 className="text-2xl font-bold text-bright">{t("categories.avatar")}</h2>
            <p className="mb-6 mt-1 text-sm text-dim">{t("avatarDesc")}</p>
            <div className="flex flex-wrap items-end gap-8">
              {avatarBox("h-44 w-44 text-6xl", "184px")}
              {avatarBox("h-16 w-16 text-2xl", "64px")}
              {avatarBox("h-8 w-8 text-sm", "32px")}
              <div className="max-w-56">
                <label className="btn-gray DialogButton Focusable block cursor-pointer px-5 py-2.5 text-center text-sm">
                  {t("uploadAvatar")}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => upload("avatar", e.target.files?.[0] ?? null)}
                  />
                </label>
                <p className="mt-2 text-xs text-dim">
                  {t("avatarHint")}
                </p>
              </div>
            </div>
          </>
        )}

        {cat === "background" && (
          <>
            <h2 className="text-2xl font-bold text-bright">{t("categories.background")}</h2>
            <p className="mb-6 mt-1 text-sm text-dim">
              {t("backgroundDesc")}
            </p>
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <label className="btn-gray DialogButton Focusable cursor-pointer px-5 py-2.5 text-sm">
                {t("uploadCustomBackground")}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => upload("background", e.target.files?.[0] ?? null)}
                />
              </label>
              {background && (
                <GpButton onClick={() => pickBackground(null)}>{t("removeBackground")}</GpButton>
              )}
            </div>
            {/* Search all hero art by game name */}
            <input
              className="input-dark mb-4 w-full max-w-md px-3 py-2.5 text-sm"
              placeholder={t("searchGamesPlaceholder")}
              value={bgQuery}
              onChange={(e) => setBgQuery(e.target.value)}
              autoComplete="off"
            />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {bgItems.map((b) => (
                <button
                  key={b.url}
                  onClick={() => pickBackground(b.url)}
                  className={`group relative aspect-video cursor-pointer overflow-hidden rounded transition-transform hover:scale-[1.02] ${
                    background === b.url ? "ring-2 ring-accent" : "ring-1 ring-white/10"
                  }`}
                  title={b.title}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={b.url} alt={b.title} className="h-full w-full object-cover" loading="lazy" />
                  <span className="absolute inset-x-0 bottom-0 truncate bg-black/60 px-2 py-1 text-left text-[11px] text-body opacity-0 transition-opacity group-hover:opacity-100">
                    {b.title}
                  </span>
                  {background === b.url && (
                    <span className="absolute right-1.5 top-1.5 rounded bg-accent px-1.5 text-xs font-bold text-black">
                      ✓
                    </span>
                  )}
                </button>
              ))}
            </div>
            {/* Infinite-scroll sentinel + status */}
            <div ref={bgSentinel} className="h-8" />
            {bgLoading && <p className="mt-2 text-sm text-dim">{t("loading")}</p>}
            {!bgLoading && bgItems.length === 0 && (
              <p className="text-sm text-dim">
                {bgQuery
                  ? t("noMatchingHeroArt", { query: bgQuery })
                  : t("noHeroArt")}
              </p>
            )}
            {!bgHasMore && bgItems.length > 0 && (
              <p className="mt-2 text-xs text-dim">{t("thatsEverything")}</p>
            )}
          </>
        )}

        {cat === "theme" && (
          <>
            <h2 className="text-2xl font-bold text-bright">{t("categories.theme")}</h2>
            <p className="mb-8 mt-1 text-sm text-dim">{t("themeDesc")}</p>
            <div className="flex flex-wrap gap-12">
              {THEME_OPTIONS.map((opt) => {
                const themeName = t(`themeName.${opt.key}`);
                return (
                <button
                  key={opt.key}
                  onClick={() => {
                    setTheme(opt.key);
                    patch({ theme: opt.key }, `✓ ${themeName}`);
                  }}
                  className="group flex cursor-pointer flex-col items-center gap-4"
                >
                  <span
                    className={`h-36 w-36 rounded-full transition-transform group-hover:scale-105 ${
                      theme === opt.key ? "ring-4 ring-accent/70" : "ring-1 ring-white/15"
                    }`}
                    style={{ background: opt.swatch }}
                  />
                  <span
                    className={`text-[15px] font-semibold ${theme === opt.key ? "text-accent" : "text-body"}`}
                  >
                    {themeName}
                  </span>
                </button>
                );
              })}
            </div>
          </>
        )}

        {cat === "badge" && (
          <>
            <h2 className="text-2xl font-bold text-bright">{t("categories.badge")}</h2>
            <p className="mb-6 mt-1 text-sm text-dim">
              {t("badgeDesc")}
            </p>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {badges.map((b) => (
                <button
                  key={b.key}
                  onClick={() => setBadge(b.key)}
                  className={`flex cursor-pointer items-center gap-4 rounded-[3px] px-4 py-3 text-left transition-colors ${
                    badge === b.key ? "bg-white/10 ring-1 ring-accent" : "bg-[#1b2028] hover:bg-[#232a34]"
                  }`}
                >
                  <BadgeIcon badge={b} size="md" />
                  <div className="min-w-0">
                    <div className="truncate text-[15px] font-semibold text-bright">{b.name}</div>
                    <div className="truncate text-xs text-dim">{b.detail}</div>
                  </div>
                </button>
              ))}
            </div>
            <div className="mt-8 flex justify-end gap-3">
              <GpButton onClick={() => setBadge(user.featured_badge)}>{t("cancel")}</GpButton>
              <GpButton primary onClick={() => patch({ featured_badge: badge })} disabled={busy}>
                {t("save")}
              </GpButton>
            </div>
          </>
        )}

        {cat === "connections" && (
          <>
            <h2 className="text-2xl font-bold text-bright">{t("categories.connections")}</h2>
            <p className="mb-6 mt-1 text-sm text-dim">
              {t("connectionsDesc")}
            </p>
            <RetroAchievementsLink />
          </>
        )}

        {msg && <p className="mt-5 text-sm text-accent">{msg}</p>}
      </div>
    </div>
  );
}
