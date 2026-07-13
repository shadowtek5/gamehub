"use client";

import { GpDropdown, GpButton, GpCheck, GpConfirm } from "@/components/bpm/primitives";

// SteamOS game Properties page: left sidebar (game title + categories),
// right pane of full-width setting rows, exactly like the Deck's
// per-game properties screen.

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { PLATFORMS_SORTED, platformBySlug } from "@/lib/platforms";
import { libretroBoxartUrl, libretroBoxartUrlFromTitle } from "@/lib/boxart";
import ScrapeButton from "./ScrapeButton";

interface RomData {
  id: number;
  filename: string;
  path: string;
  size: string;
  added: string;
  title: string;
  platform_slug: string;
  region: string | null;
  boxart_url: string | null;
  hero_url: string | null;
  icon_url: string | null;
  description: string | null;
  developer: string | null;
  publisher: string | null;
  genre: string | null;
  players: string | null;
  rating: string | null;
  release_date: string | null;
  language: string | null;
  scraped_at: string | null;
  metadata_source: string | null;
  theme_url: string | null;
  theme_yt_id: string | null;
}

const CATEGORIES = [
  { key: "general" },
  { key: "artwork" },
  { key: "media" },
  { key: "metadata" },
  { key: "file" },
] as const;

const UPLOAD_TYPES: { type: string; accept: string }[] = [
  { type: "boxart", accept: "image/*" },
  { type: "hero", accept: "image/*" },
  { type: "screenshot", accept: "image/*" },
  { type: "icon", accept: "image/*" },
  { type: "video", accept: "video/*" },
  { type: "theme", accept: "audio/*" },
  { type: "manual", accept: "application/pdf" },
];

function Row({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-[3px] bg-[#1b2028] px-5 py-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <div className="text-[15px] text-body">{label}</div>
        <div className="flex w-full shrink-0 items-center sm:w-auto">{children}</div>
      </div>
      {description && <div className="mt-1 text-xs text-dim">{description}</div>}
    </div>
  );
}

export default function RomProperties({
  rom,
  isAdmin = false,
  mobile = false,
}: {
  rom: RomData;
  isAdmin?: boolean;
  /** rendered inside the /mobile shell — keep post-delete navigation on mobile routes */
  mobile?: boolean;
}) {
  const t = useTranslations("romProperties");
  const [cat, setCat] = useState<string>("general");
  const [title, setTitle] = useState(rom.title);
  const [platform, setPlatform] = useState(rom.platform_slug);
  const [region, setRegion] = useState(rom.region ?? "");
  const [boxart, setBoxart] = useState(rom.boxart_url ?? "");
  const [hero, setHero] = useState(rom.hero_url ?? "");
  const [icon, setIcon] = useState(rom.icon_url ?? "");
  const [description, setDescription] = useState(rom.description ?? "");
  const [developer, setDeveloper] = useState(rom.developer ?? "");
  const [publisher, setPublisher] = useState(rom.publisher ?? "");
  const [genre, setGenre] = useState(rom.genre ?? "");
  const [players, setPlayers] = useState(rom.players ?? "");
  const [rating, setRating] = useState(rom.rating ?? "");
  const [releaseDate, setReleaseDate] = useState(rom.release_date ?? "");
  const [language, setLanguage] = useState(rom.language ?? "");
  const [previewBroken, setPreviewBroken] = useState(false);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploadMsgs, setUploadMsgs] = useState<Record<string, string>>({});
  const [themeYt, setThemeYt] = useState(
    rom.theme_yt_id ? `https://www.youtube.com/watch?v=${rom.theme_yt_id}` : ""
  );
  const [themeMsg, setThemeMsg] = useState("");
  const [newFilename, setNewFilename] = useState(rom.filename);
  const [fileMsg, setFileMsg] = useState("");
  const [deleteFileToo, setDeleteFileToo] = useState(false);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const router = useRouter();

  async function renameFile() {
    setBusy(true);
    setFileMsg("");
    try {
      const res = await fetch(`/api/roms/${rom.id}/rename`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: newFilename.trim() }),
      });
      const data = await res.json();
      setFileMsg(res.ok ? t("renamedOnDisk") : `✗ ${data.error ?? t("failed")}`);
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function removeRom() {
    setBusy(true);
    setFileMsg("");
    try {
      const res = await fetch(`/api/roms/${rom.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deleteFile: deleteFileToo }),
      });
      const data = await res.json();
      if (res.ok) {
        router.push(`${mobile ? "/mobile" : ""}/systems/${rom.platform_slug}`);
        router.refresh();
      } else {
        setFileMsg(`✗ ${data.error ?? t("failed")}`);
        setDeleteArmed(false);
      }
    } finally {
      setBusy(false);
    }
  }

  async function patchTheme(body: Record<string, unknown>, okMsg: string) {
    setThemeMsg("…");
    try {
      const res = await fetch(`/api/roms/${rom.id}/theme`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      setThemeMsg(res.ok ? okMsg : `✗ ${data.error ?? t("failed")}`);
      if (res.ok) router.refresh();
    } catch (e) {
      setThemeMsg(`✗ ${e instanceof Error ? e.message : e}`);
    }
  }

  async function uploadMedia(type: string, file: File | null) {
    if (!file) return;
    setUploadMsgs((cur) => ({ ...cur, [type]: t("uploading") }));
    try {
      const form = new FormData();
      form.append("type", type);
      form.append("file", file);
      const res = await fetch(`/api/roms/${rom.id}/media`, { method: "POST", body: form });
      const data = await res.json();
      setUploadMsgs((cur) => ({
        ...cur,
        [type]: res.ok ? t("replaced") : `✗ ${data.error ?? t("uploadFailed")}`,
      }));
      if (res.ok) router.refresh();
    } catch (e) {
      setUploadMsgs((cur) => ({ ...cur, [type]: `✗ ${e instanceof Error ? e.message : e}` }));
    }
  }

  function setArt(url: string) {
    setBoxart(url);
    setPreviewBroken(false);
  }

  async function save() {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch(`/api/roms/${rom.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          platform_slug: platform,
          region: region.trim() || null,
          boxart_url: boxart.trim() || null,
          hero_url: hero.trim() || null,
          icon_url: icon.trim() || null,
          description: description.trim() || null,
          developer: developer.trim() || null,
          publisher: publisher.trim() || null,
          genre: genre.trim() || null,
          players: players.trim() || null,
          rating: rating.trim() || null,
          release_date: releaseDate.trim() || null,
          language: language.trim() || null,
        }),
      });
      const data = await res.json();
      setMsg(res.ok ? t("saved") : `✗ ${data.error ?? t("failed")}`);
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const p = platformBySlug(platform);

  return (
    <div className="flex min-h-[75vh] flex-col gap-8 md:flex-row">
      {/* Sidebar */}
      <nav className="w-full shrink-0 md:w-64">
        <div className="mb-5 px-4 text-2xl font-bold text-bright">{rom.title}</div>
        <div className="flex flex-row gap-1 overflow-x-auto md:flex-col">
          {CATEGORIES.map((c) => (
            <button
              key={c.key}
              onClick={() => setCat(c.key)}
              className={`menu-item whitespace-nowrap rounded-[3px] !py-3 text-[15px] ${cat === c.key ? "bg-white/10" : ""}`}
              style={cat === c.key ? { boxShadow: "inset 4px 0 0 var(--accent)" } : undefined}
            >
              {t(`categories.${c.key}`)}
            </button>
          ))}
        </div>
      </nav>

      {/* Rows */}
      <div className="min-w-0 flex-1">
        <h2 className="mb-5 text-2xl font-bold text-bright">
          {t(`categories.${cat}`)}
        </h2>

        {cat === "general" && (
          <div className="flex flex-col gap-3">
            <Row label={t("titleLabel")}>
              <input
                className="input-dark w-full px-3 py-2 text-sm sm:w-72"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </Row>
            <Row label={t("systemLabel")} description={t("systemDesc")}>
              <GpDropdown
                value={platform}
                width={288}
                onChange={setPlatform}
                options={PLATFORMS_SORTED.map((pl) => ({ value: pl.slug, label: pl.name }))}
              />
            </Row>
            <Row label={t("regionLabel")}>
              <input
                className="input-dark w-32 px-3 py-2 text-sm"
                placeholder={t("regionPlaceholder")}
                value={region}
                onChange={(e) => setRegion(e.target.value)}
              />
            </Row>
          </div>
        )}

        {cat === "artwork" && (
          <div className="flex flex-col gap-6 sm:flex-row">
            <div className="flex flex-1 flex-col gap-3">
              <Row
                label={t("boxartUrlLabel")}
                description={t("boxartUrlDesc")}
              >
                <input
                  className="input-dark w-full px-3 py-2 text-sm sm:w-80"
                  placeholder={t("urlPlaceholder")}
                  value={boxart}
                  onChange={(e) => setArt(e.target.value)}
                />
              </Row>
              <Row
                label={t("matchFilenameLabel")}
                description={t("matchFilenameDesc")}
              >
                <GpButton onClick={() => p && setArt(libretroBoxartUrl(p, rom.filename))}>
                  {t("matchButton")}
                </GpButton>
              </Row>
              <Row
                label={t("matchTitleLabel")}
                description={t("matchTitleDesc")}
              >
                <GpButton onClick={() => p && setArt(libretroBoxartUrlFromTitle(p, title.trim()))}>
                  {t("matchButton")}
                </GpButton>
              </Row>
              <Row
                label={t("heroUrlLabel")}
                description={t("heroUrlDesc")}
              >
                <input
                  className="input-dark w-full px-3 py-2 text-sm sm:w-80"
                  placeholder={t("urlPlaceholder")}
                  value={hero}
                  onChange={(e) => setHero(e.target.value)}
                />
              </Row>
              <Row
                label={t("iconUrlLabel")}
                description={t("iconUrlDesc")}
              >
                <input
                  className="input-dark w-full px-3 py-2 text-sm sm:w-80"
                  placeholder={t("urlPlaceholder")}
                  value={icon}
                  onChange={(e) => setIcon(e.target.value)}
                />
              </Row>
            </div>
            <div className="w-44 shrink-0">
              {boxart && !previewBroken ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={boxart}
                  alt={t("boxartPreviewAlt")}
                  className="h-60 w-44 rounded object-cover"
                  onError={() => setPreviewBroken(true)}
                />
              ) : (
                <div className="flex h-60 w-44 items-center justify-center rounded bg-[#1b2028] px-3 text-center text-xs text-dim">
                  {boxart ? t("noImageAtUrl") : t("generatedCover")}
                </div>
              )}
            </div>
          </div>
        )}

        {cat === "media" && (
          <div className="flex flex-col gap-3">
            <p className="text-xs text-dim">{t("mediaIntro")}</p>
            {UPLOAD_TYPES.map((u) => (
              <Row key={u.type} label={t(`upload.${u.type}.label`)} description={t(`upload.${u.type}.hint`)}>
                <div className="flex items-center gap-3">
                  {uploadMsgs[u.type] && (
                    <span className="text-xs text-accent">{uploadMsgs[u.type]}</span>
                  )}
                  <label className="btn-gray cursor-pointer px-4 py-2 text-sm">
                    {t("chooseFile")}
                    <input
                      type="file"
                      accept={u.accept}
                      className="hidden"
                      onChange={(e) => uploadMedia(u.type, e.target.files?.[0] ?? null)}
                    />
                  </label>
                </div>
              </Row>
            ))}

            <div className="rounded-[3px] bg-[#1b2028] px-5 py-4">
              <div className="text-[15px] text-body">{t("themeMusicYoutube")}</div>
              <div className="mt-1 text-xs text-dim">
                {rom.theme_url
                  ? t("themeDescFile")
                  : rom.theme_yt_id
                    ? t("themeDescYt")
                    : t("themeDescNone")}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <input
                  className="input-dark w-full px-3 py-2 text-sm sm:w-96"
                  placeholder={t("youtubePlaceholder")}
                  value={themeYt}
                  onChange={(e) => setThemeYt(e.target.value)}
                />
                <GpButton
                  onClick={() => patchTheme({ youtube: themeYt.trim() }, t("themeSaved"))}
                  disabled={!themeYt.trim()}
                >
                  {t("setVideo")}
                </GpButton>
                <GpButton
                  onClick={() => {
                    setThemeYt("");
                    patchTheme({ youtube: null }, t("themeCleared"));
                  }}
                >
                  {t("reSearch")}
                </GpButton>
                {rom.theme_url && (
                  <GpButton onClick={() => patchTheme({ clearFile: true }, t("themeRemoved"))}>
                    {t("removeUploadedFile")}
                  </GpButton>
                )}
                {themeMsg && <span className="text-xs text-accent">{themeMsg}</span>}
              </div>
            </div>
          </div>
        )}

        {cat === "metadata" && (
          <div className="flex flex-col gap-3">
            <Row
              label={t("scrapeMetadataLabel")}
              description={
                rom.scraped_at
                  ? t("lastScraped", { date: rom.scraped_at.slice(0, 10), source: rom.metadata_source ?? "" })
                  : t("scrapeDesc")
              }
            >
              <ScrapeButton romId={rom.id} />
            </Row>

            <div className="rounded-[3px] bg-[#1b2028] px-5 py-4">
              <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-bold uppercase tracking-widest text-dim">
                    {t("developerLabel")}
                  </span>
                  <input
                    className="input-dark px-3 py-2 text-sm"
                    value={developer}
                    onChange={(e) => setDeveloper(e.target.value)}
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-bold uppercase tracking-widest text-dim">
                    {t("publisherLabel")}
                  </span>
                  <input
                    className="input-dark px-3 py-2 text-sm"
                    value={publisher}
                    onChange={(e) => setPublisher(e.target.value)}
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-bold uppercase tracking-widest text-dim">
                    {t("genreLabel")}
                  </span>
                  <input
                    className="input-dark px-3 py-2 text-sm"
                    placeholder={t("genrePlaceholder")}
                    value={genre}
                    onChange={(e) => setGenre(e.target.value)}
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-bold uppercase tracking-widest text-dim">
                    {t("releaseDateLabel")}
                  </span>
                  <input
                    className="input-dark px-3 py-2 text-sm"
                    placeholder={t("releaseDatePlaceholder")}
                    value={releaseDate}
                    onChange={(e) => setReleaseDate(e.target.value)}
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-bold uppercase tracking-widest text-dim">
                    {t("playersLabel")}
                  </span>
                  <input
                    className="input-dark px-3 py-2 text-sm"
                    placeholder={t("playersPlaceholder")}
                    value={players}
                    onChange={(e) => setPlayers(e.target.value)}
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-bold uppercase tracking-widest text-dim">
                    {t("ratingLabel")}
                  </span>
                  <input
                    className="input-dark px-3 py-2 text-sm"
                    placeholder={t("ratingPlaceholder")}
                    value={rating}
                    onChange={(e) => setRating(e.target.value)}
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-bold uppercase tracking-widest text-dim">
                    {t("languagesLabel")}
                  </span>
                  <input
                    className="input-dark px-3 py-2 text-sm"
                    placeholder={t("languagesPlaceholder")}
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                  />
                </label>
              </div>
            </div>

            <div className="rounded-[3px] bg-[#1b2028] px-5 py-4">
              <div className="mb-2 text-[15px] text-body">{t("descriptionLabel")}</div>
              <textarea
                className="input-dark min-h-40 w-full px-3 py-2 text-sm leading-relaxed"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t("descriptionPlaceholder")}
              />
            </div>
          </div>
        )}

        {cat === "file" && (
          <div className="flex flex-col gap-3">
            {isAdmin ? (
              <div className="rounded-[3px] bg-[#1b2028] px-5 py-4">
                <div className="text-[15px] text-body">{t("filenameLabel")}</div>
                <div className="mt-1 text-xs text-dim">
                  {t("renameDesc")}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <input
                    className="input-dark min-w-0 flex-1 px-3 py-2 text-sm sm:min-w-72"
                    value={newFilename}
                    onChange={(e) => setNewFilename(e.target.value)}
                  />
                  <GpButton
                    onClick={renameFile}
                    disabled={busy || newFilename.trim() === rom.filename || !newFilename.trim()}
                  >
                    {t("renameButton")}
                  </GpButton>
                </div>
              </div>
            ) : (
              <Row label={t("filenameLabel")}>
                <span className="max-w-md break-all text-sm text-dim">{rom.filename}</span>
              </Row>
            )}
            <Row label={t("pathLabel")}>
              <span className="max-w-md break-all text-sm text-dim">{rom.path}</span>
            </Row>
            <Row label={t("sizeLabel")}>
              <span className="text-sm text-dim">{rom.size}</span>
            </Row>
            <Row label={t("addedLabel")}>
              <span className="text-sm text-dim">{rom.added}</span>
            </Row>

            {isAdmin && (
              <div className="rounded-[3px] border border-[#a33a3a]/40 bg-[#2a1b1b] px-5 py-4">
                <div className="text-[15px] font-semibold text-[#ff9d9d]">{t("dangerZone")}</div>
                <div className="mt-1 text-xs text-dim">
                  {t("dangerIntro")}{" "}
                  {deleteFileToo
                    ? t("dangerDeleteFile")
                    : t("dangerKeepFile")}
                </div>
                <div className="mt-3">
                  <GpCheck
                    checked={deleteFileToo}
                    onChange={(v) => {
                      setDeleteFileToo(v);
                      setDeleteArmed(false);
                    }}
                    label={t("alsoDeleteFile")}
                  />
                </div>
                <div className="mt-3">
                  <GpButton
                    onClick={() => setDeleteArmed(true)}
                    disabled={busy}
                    className="!bg-[#a33a3a] hover:!bg-[#c04545]"
                  >
                    {t("removeFromLibrary")}
                  </GpButton>
                </div>
                {deleteArmed && (
                  <GpConfirm
                    title={t("confirmTitle")}
                    confirmLabel={deleteFileToo ? t("confirmDelete") : t("confirmRemove")}
                    danger
                    onConfirm={removeRom}
                    onClose={() => setDeleteArmed(false)}
                  >
                    {deleteFileToo
                      ? t.rich("deleteConfirmBodyDelete", {
                          filename: rom.filename,
                          b: (chunks) => <span className="font-bold text-bright">{chunks}</span>,
                        })
                      : t.rich("deleteConfirmBodyKeep", {
                          filename: rom.filename,
                          b: (chunks) => <span className="font-bold text-bright">{chunks}</span>,
                        })}
                  </GpConfirm>
                )}
                {fileMsg && <p className="mt-2 text-sm text-accent">{fileMsg}</p>}
              </div>
            )}
            {!isAdmin && fileMsg && <p className="text-sm text-accent">{fileMsg}</p>}
          </div>
        )}

        {cat !== "file" && cat !== "media" && (
          <div className="mt-6 flex items-center gap-4">
            <GpButton primary onClick={save} disabled={busy} className="px-8">
              {busy ? t("saving") : t("save")}
            </GpButton>
            {msg && <span className="text-sm text-accent">{msg}</span>}
          </div>
        )}
      </div>
    </div>
  );
}
