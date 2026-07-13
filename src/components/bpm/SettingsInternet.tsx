"use client";

// Settings → Internet: metadata provider accounts as clean Steam-style rows
// (each shows connected/not-configured + a Configure button) that open a
// GpModal with the provider's credential fields and a live Test — the same
// row→modal pattern as Storage. Uses the existing /api/providers endpoints.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { playSound } from "@/lib/sounds";
import { GpSubHeader, GpButton, GpModal, GpToggle } from "./primitives";

interface Field {
  key: string;
  label: string;
  secret?: boolean;
}
interface Provider {
  key: string;
  name: string;
  gives: string;
  howto: React.ReactNode;
  fields: Field[];
}

const PROVIDERS: Provider[] = [
  {
    key: "screenscraper",
    name: "ScreenScraper",
    gives: "givesScreenscraper",
    howto: (
      <>
        Register free at{" "}
        <a href="https://www.screenscraper.fr" target="_blank" rel="noreferrer" className="text-accent hover:underline">screenscraper.fr</a>{" "}
        — GameHub ships with its own app credentials, so your account is all you need.
      </>
    ),
    fields: [
      { key: "ssid", label: "fieldUsername" },
      { key: "sspassword", label: "fieldPassword", secret: true },
    ],
  },
  {
    key: "igdb",
    name: "IGDB",
    gives: "givesIgdb",
    howto: (
      <>
        Create a free app at{" "}
        <a href="https://dev.twitch.tv/console/apps" target="_blank" rel="noreferrer" className="text-accent hover:underline">dev.twitch.tv/console/apps</a>{" "}
        and copy its Client ID and Client Secret.
      </>
    ),
    fields: [
      { key: "clientId", label: "fieldClientId" },
      { key: "clientSecret", label: "fieldClientSecret", secret: true },
    ],
  },
  {
    key: "mobygames",
    name: "MobyGames",
    gives: "givesMobygames",
    howto: (
      <>
        Request a free non-commercial API key at{" "}
        <a href="https://www.mobygames.com/info/api/" target="_blank" rel="noreferrer" className="text-accent hover:underline">mobygames.com/info/api</a>.
      </>
    ),
    fields: [{ key: "apiKey", label: "fieldApiKey", secret: true }],
  },
  {
    key: "thegamesdb",
    name: "TheGamesDB",
    gives: "givesThegamesdb",
    howto: (
      <>
        Request a free public API key on the{" "}
        <a href="https://forums.thegamesdb.net/viewforum.php?f=10" target="_blank" rel="noreferrer" className="text-accent hover:underline">TheGamesDB forums</a>{" "}
        (monthly request allowance — best kept lower in priority for bulk scrapes).
      </>
    ),
    fields: [{ key: "apiKey", label: "fieldApiKey", secret: true }],
  },
  {
    key: "steamgriddb",
    name: "SteamGridDB",
    gives: "givesSteamgriddb",
    howto: (
      <>
        Generate a key at{" "}
        <a href="https://www.steamgriddb.com/profile/preferences/api" target="_blank" rel="noreferrer" className="text-accent hover:underline">steamgriddb.com</a>{" "}
        under Profile → Preferences → API.
      </>
    ),
    fields: [{ key: "apiKey", label: "fieldApiKey", secret: true }],
  },
  {
    key: "emumovies",
    name: "EmuMovies",
    gives: "givesEmumovies",
    howto: (
      <>
        Requires an{" "}
        <a href="https://emumovies.com" target="_blank" rel="noreferrer" className="text-accent hover:underline">emumovies.com</a>{" "}
        supporter account.
      </>
    ),
    fields: [
      { key: "username", label: "fieldUsername" },
      { key: "password", label: "fieldPassword", secret: true },
    ],
  },
];

type Config = Record<string, Record<string, string>>;

export default function SettingsInternet() {
  const t = useTranslations("settingsProviders.internet");
  const [config, setConfig] = useState<Config>({});
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [test, setTest] = useState<{ ok: boolean; message: string } | "testing" | null>(null);
  const [ssInsecure, setSsInsecure] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/providers", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        setConfig(d.config ?? {});
        setSsInsecure(!!d.ssInsecureTls);
      })
      .catch(() => {});
  }, []);

  async function toggleSsInsecure(v: boolean) {
    setSsInsecure(v);
    await fetch("/api/providers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ssInsecureTls: v }),
    });
  }

  const isConfigured = (p: Provider) =>
    p.fields.every((f) => (config[p.key]?.[f.key] ?? "").trim().length > 0);

  function openConfigure(p: Provider) {
    playSound("activate");
    setDraft({ ...(config[p.key] ?? {}) });
    setTest(null);
    setOpenKey(p.key);
  }

  async function persist(providerKey: string, values: Record<string, string>) {
    const next = { ...config, [providerKey]: values };
    setConfig(next);
    await fetch("/api/providers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [providerKey]: values }),
    });
  }

  async function saveAndClose(p: Provider) {
    await persist(p.key, draft);
    setOpenKey(null);
    router.refresh();
  }

  async function runTest(p: Provider) {
    setTest("testing");
    await persist(p.key, draft);
    try {
      const res = await fetch("/api/providers/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: p.key }),
      });
      const data = await res.json();
      setTest({ ok: !!data.ok, message: data.message ?? (data.ok ? t("connected") : t("failed")) });
    } catch {
      setTest({ ok: false, message: t("networkError") });
    }
  }

  const active = PROVIDERS.find((p) => p.key === openKey);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <GpSubHeader>{t("metadataProviders")}</GpSubHeader>
        {PROVIDERS.map((p) => {
          const configured = isConfigured(p);
          return (
            <div key={p.key} className="settings-row">
              <div className="min-w-0">
                <div className="text-[16px] text-body">{p.name}</div>
                <div className="mt-1 text-[12px] text-dim">{t(p.gives)}</div>
              </div>
              <div className="flex shrink-0 items-center gap-4">
                <span className={`text-[13px] font-semibold ${configured ? "text-[#8ce05f]" : "text-dim"}`}>
                  {configured ? t("connected") : t("notConfigured")}
                </span>
                <GpButton onClick={() => openConfigure(p)}>{t("configure")}</GpButton>
              </div>
            </div>
          );
        })}
      </div>

      {active && (
        <GpModal
          title={active.name}
          width={560}
          onClose={() => setOpenKey(null)}
          footer={
            <>
              <GpButton onClick={() => setOpenKey(null)}>{t("cancel")}</GpButton>
              <GpButton onClick={() => runTest(active)} disabled={test === "testing"}>
                {test === "testing" ? t("testing") : t("testLabel")}
              </GpButton>
              <GpButton primary onClick={() => saveAndClose(active)}>
                {t("save")}
              </GpButton>
            </>
          }
        >
          <div className="flex flex-col gap-4 py-2">
            <p className="text-[13px] leading-relaxed text-dim">{active.howto}</p>
            {active.fields.map((f) => (
              <label key={f.key} className="flex flex-col gap-1.5">
                <span className="text-[12px] font-bold uppercase tracking-[0.5px] text-dim">{t(f.label)}</span>
                <input
                  type={f.secret ? "password" : "text"}
                  autoComplete={f.secret ? "new-password" : "off"}
                  data-form-type="other"
                  className="input-dark rounded-[2px] px-3 py-2 text-[15px]"
                  value={draft[f.key] ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                />
              </label>
            ))}
            {test && test !== "testing" && (
              <div className={`text-[13px] ${test.ok ? "text-[#8ce05f]" : "text-danger"}`}>
                {test.ok ? "✓" : "✗"} {test.message}
              </div>
            )}

            {active.key === "screenscraper" && (
              <div className="mt-2 rounded-[3px] border border-white/10 bg-black/20 p-3">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-[13px] font-semibold text-body">
                    {t("ignoreTls")}
                  </span>
                  <GpToggle on={ssInsecure} onChange={toggleSsInsecure} label={t("ignoreTls")} />
                </div>
                <p className="mt-1.5 text-[12px] leading-relaxed text-dim">
                  {t.rich("ignoreTlsNote", { c: (c) => <span className="text-body">{c}</span> })}
                </p>
              </div>
            )}
          </div>
        </GpModal>
      )}
    </div>
  );
}
