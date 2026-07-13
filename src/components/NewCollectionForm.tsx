"use client";

import { GpSwitch, GpDropdown, GpModal, GpButton, GpToggle, GpRow } from "@/components/bpm/primitives";

// Create a collection: a plain hand-curated one, or a ⚡ smart collection
// defined by filters (kept in sync automatically). Fields AND together;
// values within genre/language pick any (OR) or all (AND).

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { PLATFORMS_SORTED } from "@/lib/platforms";
import { LANGUAGE_NAMES } from "@/lib/language";
import { playSound } from "@/lib/sounds";

const STATUS_OPTIONS = [
  { value: "none", labelKey: "statusNeverPlayed" },
  { value: "backlog", labelKey: "statusBacklog" },
  { value: "playing", labelKey: "statusPlaying" },
  { value: "beaten", labelKey: "statusBeaten" },
  { value: "dropped", labelKey: "statusDropped" },
];

/** BPM-style multi-pick: a scrollable field of toggle chips (same look as the
 *  Play-status row) instead of a native multi-select listbox. Hoisted to
 *  module scope so it isn't recreated (and remounted) on every render. */
function ChipPicker({
  options,
  selected,
  onChange,
}: {
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <div className="flex max-h-36 flex-wrap content-start gap-1.5 overflow-y-auto rounded-[3px] bg-black/25 p-2">
      {options.map((o) => {
        const on = selected.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => {
              playSound(on ? "toggleOff" : "toggleOn");
              onChange(on ? selected.filter((v) => v !== o.value) : [...selected, o.value]);
            }}
            className={`cursor-pointer rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
              on ? "bg-accent/25 text-accent" : "bg-white/5 text-dim hover:text-bright"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export default function NewCollectionForm({
  platforms,
  variants,
  genres,
  languages,
}: {
  platforms: string[];
  variants: string[];
  genres: string[];
  languages: string[];
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isSmart, setIsSmart] = useState(false);
  const [isPublic, setIsPublic] = useState(false);
  const [fPlatforms, setFPlatforms] = useState<string[]>([]);
  const [fGenres, setFGenres] = useState<string[]>([]);
  const [genresLogic, setGenresLogic] = useState<"any" | "all">("any");
  const [fLanguages, setFLanguages] = useState<string[]>([]);
  const [languagesLogic, setLanguagesLogic] = useState<"any" | "all">("any");
  const [fVariants, setFVariants] = useState<string[]>([]);
  const [fStatuses, setFStatuses] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [playable, setPlayable] = useState(false);
  const [msg, setMsg] = useState("");
  const router = useRouter();
  const t = useTranslations("collectionsComps.newForm");

  // Deep-link from the game options modal's "Create Dynamic Collection": open
  // straight into the smart-collection builder.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (new URLSearchParams(window.location.search).get("new") === "smart") {
      setOpen(true);
      setIsSmart(true);
    }
  }, []);

  const presentPlatforms = PLATFORMS_SORTED.filter((p) => platforms.includes(p.slug));

  function toggleStatus(value: string) {
    setFStatuses((cur) =>
      cur.includes(value) ? cur.filter((s) => s !== value) : [...cur, value]
    );
  }

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!name.trim()) return;
    setMsg("");
    const res = await fetch("/api/collections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        description,
        isPublic,
        isSmart,
        filters: isSmart
          ? {
              platforms: fPlatforms,
              genres: fGenres,
              genres_logic: genresLogic,
              languages: fLanguages,
              languages_logic: languagesLogic,
              variants: fVariants,
              statuses: fStatuses,
              search_term: searchTerm,
              playable,
            }
          : undefined,
      }),
    });
    const data = await res.json();
    if (res.ok) {
      playSound("confirm");
      setName("");
      setDescription("");
      setOpen(false);
      router.refresh();
    } else {
      setMsg(t("submitError", { error: data.error ?? t("failed") }));
    }
  }

  const label = "text-xs font-bold uppercase tracking-widest text-dim";

  return (
    <div className="w-full sm:w-auto">
      <GpButton primary onClick={() => setOpen(true)} className="text-sm">
        {t("newCollection")}
      </GpButton>
      {open && (
        <GpModal
          title={t("createCollection")}
          width={640}
          onClose={() => setOpen(false)}
          footer={
            <>
              <GpButton onClick={() => setOpen(false)}>{t("cancel")}</GpButton>
              <GpButton primary onClick={() => void submit()} disabled={!name.trim()}>
                {t("create")}
              </GpButton>
              {msg && <span className="mr-auto text-sm text-danger">{msg}</span>}
            </>
          }
        >
          <div className="flex flex-col gap-1.5 pb-2">
            <input
              className="input-dark px-3 py-2 text-sm"
              placeholder={t("namePlaceholder")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
            <input
              className="input-dark px-3 py-2 text-sm"
              placeholder={t("descriptionPlaceholder")}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <GpRow
              label={t("smartRowLabel")}
              description={t("smartRowDescription")}
            >
              <GpToggle on={isSmart} onChange={setIsSmart} label={t("smartToggleLabel")} />
            </GpRow>
            <GpRow label={t("publicRowLabel")} description={t("publicRowDescription")}>
              <GpToggle on={isPublic} onChange={setIsPublic} label={t("publicRowLabel")} />
            </GpRow>

            {isSmart && (
              <div className="flex flex-col gap-4 border-t border-white/10 pt-4">
                <p className="text-xs text-dim">
                  {t("smartHint")}
                </p>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <span className={label}>{t("systems")}</span>
                    <ChipPicker
                      options={presentPlatforms.map((p) => ({ value: p.slug, label: p.name }))}
                      selected={fPlatforms}
                      onChange={setFPlatforms}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <span className={`${label} flex items-center gap-2`}>
                      {t("genres")}
                      {fGenres.length > 1 && (
                        <GpDropdown
                          value={genresLogic}
                          width={120}
                          onChange={(v) => setGenresLogic(v as "any" | "all")}
                          options={[
                            { value: "any", label: t("logicAnyOr") },
                            { value: "all", label: t("logicAllAnd") },
                          ]}
                        />
                      )}
                    </span>
                    <ChipPicker
                      options={genres.map((g) => ({ value: g, label: g }))}
                      selected={fGenres}
                      onChange={setFGenres}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <span className={`${label} flex items-center gap-2`}>
                      {t("languages")}
                      {fLanguages.length > 1 && (
                        <GpDropdown
                          value={languagesLogic}
                          width={120}
                          onChange={(v) => setLanguagesLogic(v as "any" | "all")}
                          options={[
                            { value: "any", label: t("logicAnyOr") },
                            { value: "all", label: t("logicAllAnd") },
                          ]}
                        />
                      )}
                    </span>
                    <ChipPicker
                      options={languages.map((l) => ({ value: l, label: LANGUAGE_NAMES[l] ?? l }))}
                      selected={fLanguages}
                      onChange={setFLanguages}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <span className={label}>{t("variants")}</span>
                    <ChipPicker
                      options={[
                        { value: "main", label: t("mainLibrary") },
                        ...variants.map((v) => ({ value: v, label: v })),
                      ]}
                      selected={fVariants}
                      onChange={setFVariants}
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className={label}>{t("playStatus")}</span>
                  <div className="flex flex-wrap gap-2">
                    {STATUS_OPTIONS.map((s) => (
                      <button
                        key={s.value}
                        type="button"
                        onClick={() => toggleStatus(s.value)}
                        className={`cursor-pointer rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                          fStatuses.includes(s.value)
                            ? "bg-accent/25 text-accent"
                            : "bg-white/5 text-dim hover:text-bright"
                        }`}
                      >
                        {fStatuses.includes(s.value) ? "✓ " : ""}
                        {t(s.labelKey)}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-4">
                  <label className="flex items-center gap-2">
                    <span className={label}>{t("titleContains")}</span>
                    <input
                      className="input-dark w-44 px-3 py-1.5 text-sm"
                      placeholder={t("titleContainsPlaceholder")}
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      playSound(playable ? "toggleOff" : "toggleOn");
                      setPlayable(!playable);
                    }}
                    role="switch"
                    aria-checked={playable}
                    className="flex cursor-pointer items-center gap-2 text-sm text-body"
                  >
                    {t("playableInBrowser")} <GpSwitch on={playable} />
                  </button>
                </div>
              </div>
            )}

          </div>
        </GpModal>
      )}
    </div>
  );
}
