"use client";

import { GpProgress } from "@/components/bpm/primitives";

// First-run onboarding: point GameHub at the ROM library, hook up metadata
// providers, run the first scan — SteamOS-styled, every step skippable.

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { platformBySlug } from "@/lib/platforms";
import { playSound } from "@/lib/sounds";
import FolderPicker from "./FolderPicker";

type TestResult = { ok: boolean; message: string } | "testing";

// One metadata source per row: what it provides, where to get credentials,
// the credential fields, and a live connection test.
function ProviderCard({
  name,
  badge,
  gives,
  howto,
  result,
  onTest,
  children,
}: {
  name: string;
  badge?: string;
  gives: string;
  howto: ReactNode;
  result?: TestResult;
  onTest: () => void;
  children: ReactNode;
}) {
  const t = useTranslations("setup");
  return (
    <div className="rounded bg-black/25 p-4">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-sm font-semibold text-body">{name}</span>
        {badge && (
          <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-dim">
            {badge}
          </span>
        )}
      </div>
      <p className="mt-1 text-xs leading-relaxed text-accent/90">{gives}</p>
      <p className="mt-1 text-xs leading-relaxed text-dim">{howto}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {children}
        <button
          onClick={onTest}
          disabled={result === "testing"}
          className="btn-gray shrink-0 cursor-pointer px-4 py-2 text-xs disabled:opacity-50"
        >
          {result === "testing" ? t("providerCard.testing") : t("providerCard.test")}
        </button>
        {result && result !== "testing" && (
          <span className={`text-xs ${result.ok ? "text-[#8ce05f]" : "text-danger"}`}>
            {result.ok ? "✓" : "✗"} {result.message}
          </span>
        )}
      </div>
    </div>
  );
}

const extLink = "text-accent hover:underline";

interface DetectedFolder {
  folder: string;
  path: string;
  platform_slug: string | null;
  variant: string | null;
}

const STEPS = ["welcome", "library", "metadata", "firstScan", "done"];

export default function SetupWizard({ username }: { username: string }) {
  const t = useTranslations("setup");
  const [step, setStep] = useState(0);
  const router = useRouter();

  // ---- step 1: library ----
  const [root, setRoot] = useState("");
  const [detecting, setDetecting] = useState(false);
  const [matched, setMatched] = useState<DetectedFolder[]>([]);
  const [unmatched, setUnmatched] = useState<DetectedFolder[]>([]);
  const [detectMsg, setDetectMsg] = useState("");
  const [foldersSaved, setFoldersSaved] = useState(false);

  // ---- step 2: providers ----
  const [igdbId, setIgdbId] = useState("");
  const [igdbSecret, setIgdbSecret] = useState("");
  const [sgdbKey, setSgdbKey] = useState("");
  const [mobyKey, setMobyKey] = useState("");
  const [ssUser, setSsUser] = useState("");
  const [ssPass, setSsPass] = useState("");
  const [emUser, setEmUser] = useState("");
  const [emPass, setEmPass] = useState("");
  const [providerMsg, setProviderMsg] = useState("");
  const [tests, setTests] = useState<Record<string, TestResult>>({});
  const [lbState, setLbState] = useState<"idle" | "running" | "done" | "error">("idle");
  const [lbDetail, setLbDetail] = useState("");

  // ---- welcome: restore from backup ----
  const [showRestore, setShowRestore] = useState(false);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [restoreProgress, setRestoreProgress] = useState(0);
  const [restoreMsg, setRestoreMsg] = useState("");
  const [restoreDone, setRestoreDone] = useState(false);

  // ---- step 3: scan ----
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<{
    scanned: number;
    added: number;
  } | null>(null);
  const [scrapeStarted, setScrapeStarted] = useState(false);

  function next() {
    playSound("tab");
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  async function finish(destination = "/") {
    playSound("confirm");
    await fetch("/api/settings/prefs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ setupComplete: true }),
    });
    router.push(destination);
    router.refresh();
  }

  async function detect() {
    if (!root.trim()) return;
    setDetecting(true);
    setDetectMsg(t("status.detectLooking"));
    setMatched([]);
    setUnmatched([]);
    try {
      const res = await fetch("/api/settings/systems/detect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ root: root.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setDetectMsg(`✗ ${data.error ?? t("status.detectReadError")}`);
        return;
      }
      const proposals: DetectedFolder[] = data.proposals ?? [];
      setMatched(proposals.filter((p) => p.platform_slug));
      setUnmatched(proposals.filter((p) => !p.platform_slug));
      setDetectMsg(
        proposals.length === 0
          ? t("status.detectNoSystems")
          : proposals.every((p) => !p.platform_slug)
            ? t("status.detectNothingRecognized")
            : ""
      );
      setFoldersSaved(false);
    } finally {
      setDetecting(false);
    }
  }

  async function saveFolders() {
    playSound("activate");
    await Promise.all([
      fetch("/api/settings/systems", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          folders: matched.map((m) => ({
            platform_slug: m.platform_slug,
            path: m.path,
            variant: m.variant,
          })),
        }),
      }),
      fetch("/api/settings/library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paths: [root.trim()] }),
      }),
    ]);
    setFoldersSaved(true);
    next();
  }

  function providersBody() {
    return {
      igdb: { clientId: igdbId, clientSecret: igdbSecret },
      steamgriddb: { apiKey: sgdbKey },
      mobygames: { apiKey: mobyKey },
      screenscraper: { ssid: ssUser, sspassword: ssPass },
      emumovies: { username: emUser, password: emPass },
    };
  }

  async function saveProviders() {
    setProviderMsg(t("status.saving"));
    const res = await fetch("/api/providers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(providersBody()),
    });
    setProviderMsg(res.ok ? `✓ ${t("status.saved")}` : `✗ ${t("status.failedToSave")}`);
    if (res.ok) {
      playSound("confirm");
      next();
    }
  }

  // Saves what's typed so far, then asks the server to hit the provider's API
  async function testProvider(provider: string) {
    playSound("activate");
    setTests((t) => ({ ...t, [provider]: "testing" }));
    try {
      await fetch("/api/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(providersBody()),
      });
      const res = await fetch("/api/providers/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      const data = await res.json();
      const message = data.message ?? (data.ok ? t("status.connected") : t("status.failed"));
      setTests((t) => ({
        ...t,
        [provider]: {
          ok: !!data.ok,
          message,
        },
      }));
    } catch {
      const message = t("status.networkError");
      setTests((t) => ({ ...t, [provider]: { ok: false, message } }));
    }
  }

  async function importLaunchBox() {
    playSound("activate");
    setLbState("running");
    setLbDetail(t("status.starting"));
    await fetch("/api/providers/launchbox", { method: "POST" });
  }

  useEffect(() => {
    if (lbState !== "running") return;
    const timer = setInterval(async () => {
      try {
        const res = await fetch("/api/providers/launchbox", { cache: "no-store" });
        const data = await res.json();
        const imp = data.import;
        if (imp.running) {
          setLbDetail(
            imp.phase === "downloading"
              ? t("status.downloading", {
                  size: `${(imp.bytes / 1048576).toFixed(0)}${imp.totalBytes ? `/${(imp.totalBytes / 1048576).toFixed(0)}` : ""}`,
                })
              : t("status.importing", { count: imp.games })
          );
        } else if (imp.phase === "done" || data.status.games > 0) {
          setLbState("done");
          setLbDetail(`✓ ${t("status.gamesImported", { count: data.status.games })}`);
          clearInterval(timer);
        } else if (imp.phase === "error") {
          setLbState("error");
          setLbDetail(`✗ ${imp.error ?? t("status.importFailed")}`);
          clearInterval(timer);
        }
      } catch {}
    }, 1500);
    return () => clearInterval(timer);
  }, [lbState]);

  function runRestore() {
    if (!restoreFile) return;
    playSound("activate");
    setRestoring(true);
    setRestoreMsg("");
    setRestoreProgress(0);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/backup/restore");
    xhr.setRequestHeader("Content-Type", "application/x-tar");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) setRestoreProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      setRestoring(false);
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) {
          playSound("confirm");
          setRestoreDone(true);
          setRestoreMsg(
            `✓ ${t("welcome.restoreSuccess", { items: data.restored.join(", "), files: data.files, version: data.backupVersion })}`
          );
        } else {
          setRestoreMsg(`✗ ${data.error ?? t("status.restoreFailed")}`);
        }
      } catch {
        setRestoreMsg(`✗ ${t("status.restoreFailed")}`);
      }
    };
    xhr.onerror = () => {
      setRestoring(false);
      setRestoreMsg(`✗ ${t("status.uploadFailed")}`);
    };
    xhr.send(restoreFile);
  }

  async function runScan() {
    playSound("activate");
    setScanning(true);
    try {
      const res = await fetch("/api/scan/job", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) return;
      // Background job — poll until done so setup shows the result (it also
      // surfaces in the header/downloads page while running).
      for (;;) {
        await new Promise((r) => setTimeout(r, 1000));
        const s = await fetch("/api/scan/job").then((r) => r.json());
        if (!s.running) {
          playSound("toast");
          setScanResult({ scanned: s.scanned ?? 0, added: s.added ?? 0 });
          break;
        }
      }
    } finally {
      setScanning(false);
    }
  }

  async function startScrape() {
    await fetch("/api/scrape/job", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ onlyMissing: true }),
    });
    setScrapeStarted(true);
  }

  const label = "text-xs font-bold uppercase tracking-widest text-dim";
  const nextBtn = "btn-blue cursor-pointer px-8 py-2.5 text-sm";
  const skipBtn = "cursor-pointer text-sm text-dim hover:text-body";

  return (
    <div className="mx-auto w-full max-w-2xl">
      {/* Step dots */}
      <div className="mb-8 flex items-center justify-center gap-3">
        {STEPS.map((name, i) => (
          <div key={name} className="flex items-center gap-3">
            <div
              className={`flex items-center gap-2 text-xs font-bold uppercase tracking-widest ${
                i === step ? "text-accent" : i < step ? "text-body" : "text-dim/60"
              }`}
            >
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] ${
                  i < step
                    ? "bg-[#4c9e28]/30 text-[#8ce05f]"
                    : i === step
                      ? "bg-accent/25 text-accent"
                      : "bg-white/5"
                }`}
              >
                {i < step ? "✓" : i + 1}
              </span>
              <span className="hidden sm:inline">{t(`steps.${name}`)}</span>
            </div>
            {i < STEPS.length - 1 && <span className="h-px w-6 bg-white/10" />}
          </div>
        ))}
      </div>

      <div className="panel p-8">
        {step === 0 && (
          <div className="text-center">
            <h1 className="text-3xl font-black tracking-tight text-bright">
              {t("welcome.welcomeTo")} GAME<span className="text-accent">HUB</span>, {username}
            </h1>
            <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-dim">
              {t("welcome.intro")}
            </p>
            <button onClick={next} className={`${nextBtn} mt-8`}>
              {t("welcome.letsGo")}
            </button>
            <div className="mt-4 flex flex-col items-center gap-2">
              <button onClick={() => finish()} className={skipBtn}>
                {t("welcome.skipSetup")}
              </button>
              <button
                onClick={() => {
                  playSound("tab");
                  setShowRestore((v) => !v);
                }}
                className={skipBtn}
              >
                {t("welcome.restorePrompt")}
              </button>
            </div>

            {showRestore && (
              <div className="mt-5 rounded bg-black/25 p-4 text-left">
                <p className="text-xs leading-relaxed text-dim">
                  {t("welcome.restoreUploadPre")}{" "}
                  <code className="text-body">gamehub-backup-*.tar</code>{" "}
                  {t("welcome.restoreUploadPost")}
                </p>
                {!restoreDone ? (
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <input
                      type="file"
                      accept=".tar,application/x-tar"
                      onChange={(e) => setRestoreFile(e.target.files?.[0] ?? null)}
                      className="text-xs text-dim file:mr-3 file:cursor-pointer file:rounded file:border-0 file:bg-white/10 file:px-4 file:py-2 file:text-xs file:text-body"
                    />
                    <button
                      onClick={runRestore}
                      disabled={!restoreFile || restoring}
                      className="btn-blue cursor-pointer px-4 py-2 text-xs disabled:opacity-50"
                    >
                      {restoring
                        ? restoreProgress < 100
                          ? t("welcome.uploadingProgress", { percent: restoreProgress })
                          : t("welcome.restoring")
                        : t("welcome.restoreBackup")}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      playSound("confirm");
                      router.push("/login");
                      router.refresh();
                    }}
                    className="btn-blue mt-3 cursor-pointer px-5 py-2 text-sm"
                  >
                    {t("welcome.signInRestored")} →
                  </button>
                )}
                {restoring && (
                  <GpProgress value={restoreProgress} />
                )}
                {restoreMsg && (
                  <p className={`mt-3 text-xs ${restoreMsg.startsWith("✓") ? "text-accent" : "text-danger"}`}>
                    {restoreMsg}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {step === 1 && (
          <div>
            <h2 className="text-2xl font-bold text-bright">{t("library.heading")}</h2>
            <p className="mt-1 text-sm text-dim">
              {t("library.descPre")}{" "}
              <code className="rounded bg-black/40 px-1.5 py-0.5 text-xs">
                D:\ROMs\snes
              </code>
              {t("library.descMid")}{" "}
              <code className="rounded bg-black/40 px-1.5 py-0.5 text-xs">
                \\nas\emulation\roms
              </code>{" "}
              {t("library.descPost")}
            </p>
            <div className="mt-5 flex gap-2">
              <input
                className="input-dark flex-1 px-3 py-2.5 text-sm"
                placeholder={t("library.rootPlaceholder")}
                value={root}
                onChange={(e) => setRoot(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void detect();
                }}
                autoFocus
              />
              <FolderPicker
                initialPath={root}
                onPick={setRoot}
                title={t("library.folderPickerTitle")}
              />
              <button
                onClick={detect}
                disabled={detecting || !root.trim()}
                className="btn-blue cursor-pointer px-5 py-2.5 text-sm disabled:opacity-50"
              >
                {detecting ? t("library.detecting") : t("library.detectSystems")}
              </button>
            </div>
            {detectMsg && <p className="mt-3 text-sm text-dim">{detectMsg}</p>}

            {matched.length > 0 && (
              <>
                <div className={`${label} mt-5 mb-2`}>
                  {t("library.recognizedSystems", { count: matched.length })}
                </div>
                <div className="max-h-64 overflow-y-auto rounded bg-black/25 p-2">
                  {matched.map((m) => (
                    <div key={m.path} className="flex items-center gap-3 px-2 py-1.5 text-sm">
                      <span className="min-w-0 flex-1 truncate text-body">{m.folder}</span>
                      {m.variant && (
                        <span className="shrink-0 rounded bg-[#6a4b8a]/40 px-1.5 py-0.5 text-[10px] font-bold uppercase text-[#c9a6ee]">
                          {m.variant}
                        </span>
                      )}
                      <span className="shrink-0 text-xs text-accent">
                        {platformBySlug(m.platform_slug!)?.name ?? m.platform_slug}
                      </span>
                    </div>
                  ))}
                </div>
                {unmatched.length > 0 && (
                  <p className="mt-2 text-xs text-dim">
                    {t("library.unmatchedFolders", { count: unmatched.length })} (
                    {unmatched
                      .slice(0, 5)
                      .map((u) => u.folder)
                      .join(", ")}
                    {unmatched.length > 5 ? "…" : ""}) — {t("library.mapLater")}
                  </p>
                )}
              </>
            )}

            <div className="mt-6 flex items-center justify-between">
              <button onClick={next} className={skipBtn}>
                {t("common.skipForNow")}
              </button>
              <button
                onClick={saveFolders}
                disabled={!root.trim() || foldersSaved}
                className={`${nextBtn} disabled:opacity-50`}
              >
                {t("common.saveAndContinue")} →
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <h2 className="text-2xl font-bold text-bright">{t("metadata.heading")}</h2>
            <p className="mt-1 text-sm leading-relaxed text-dim">
              <strong className="text-body">{t("metadata.introBold")}</strong> {t("metadata.introRest")}
            </p>

            <div className="mt-4 max-h-[46vh] space-y-3 overflow-y-auto pr-1">
              <div className="rounded bg-black/25 p-4">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-sm font-semibold text-body">LaunchBox Games Database</span>
                  <span className="rounded bg-[#4c9e28]/20 px-1.5 py-0.5 text-[10px] font-bold uppercase text-[#8ce05f]">
                    {t("metadata.badgeFreeNoAccount")}
                  </span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-accent/90">
                  {t("metadata.lbGives")}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-dim">
                  {t("metadata.lbHowto")}
                </p>
                <div className="mt-3">
                  {lbState === "idle" ? (
                    <button onClick={importLaunchBox} className="btn-blue cursor-pointer px-4 py-2 text-xs">
                      {t("metadata.importNow")}
                    </button>
                  ) : (
                    <span className={`text-xs ${lbState === "error" ? "text-danger" : "text-accent"}`}>
                      {lbDetail}
                    </span>
                  )}
                </div>
              </div>

              <ProviderCard
                name="ScreenScraper"
                badge={t("metadata.badgeFreeAccount")}
                gives={t("metadata.ssGives")}
                howto={
                  <>
                    {t("metadata.ssHowtoPre")}{" "}
                    <a href="https://www.screenscraper.fr" target="_blank" rel="noreferrer" className={extLink}>
                      screenscraper.fr
                    </a>{" "}
                    {t("metadata.ssHowtoPost")}
                  </>
                }
                result={tests.screenscraper}
                onTest={() => testProvider("screenscraper")}
              >
                <input className="input-dark min-w-0 flex-1 basis-36 px-3 py-2 text-xs" placeholder={t("metadata.placeholderUsername")} value={ssUser} onChange={(e) => setSsUser(e.target.value)} autoComplete="off" data-form-type="other" />
                <input type="password" className="input-dark min-w-0 flex-1 basis-36 px-3 py-2 text-xs" placeholder={t("metadata.placeholderPassword")} value={ssPass} onChange={(e) => setSsPass(e.target.value)} autoComplete="new-password" data-form-type="other" />
              </ProviderCard>

              <ProviderCard
                name="IGDB"
                badge={t("metadata.badgeFreeAccount")}
                gives={t("metadata.igdbGives")}
                howto={
                  <>
                    {t("metadata.igdbHowtoPre")}{" "}
                    <a href="https://dev.twitch.tv/console/apps" target="_blank" rel="noreferrer" className={extLink}>
                      dev.twitch.tv/console/apps
                    </a>
                    {t("metadata.igdbHowtoPost")}
                  </>
                }
                result={tests.igdb}
                onTest={() => testProvider("igdb")}
              >
                <input className="input-dark min-w-0 flex-1 basis-36 px-3 py-2 text-xs" placeholder={t("metadata.placeholderClientId")} value={igdbId} onChange={(e) => setIgdbId(e.target.value)} autoComplete="off" data-form-type="other" />
                <input type="password" className="input-dark min-w-0 flex-1 basis-36 px-3 py-2 text-xs" placeholder={t("metadata.placeholderClientSecret")} value={igdbSecret} onChange={(e) => setIgdbSecret(e.target.value)} autoComplete="new-password" data-form-type="other" />
              </ProviderCard>

              <ProviderCard
                name="MobyGames"
                badge={t("metadata.badgeFreeApiKey")}
                gives={t("metadata.mobyGives")}
                howto={
                  <>
                    {t("metadata.mobyHowtoPre")}{" "}
                    <a href="https://www.mobygames.com/info/api/" target="_blank" rel="noreferrer" className={extLink}>
                      mobygames.com/info/api
                    </a>
                    .
                  </>
                }
                result={tests.mobygames}
                onTest={() => testProvider("mobygames")}
              >
                <input type="password" className="input-dark min-w-0 flex-1 basis-48 px-3 py-2 text-xs" placeholder={t("metadata.placeholderApiKey")} value={mobyKey} onChange={(e) => setMobyKey(e.target.value)} autoComplete="new-password" data-form-type="other" />
              </ProviderCard>

              <ProviderCard
                name="SteamGridDB"
                badge={t("metadata.badgeFreeApiKey")}
                gives={t("metadata.sgdbGives")}
                howto={
                  <>
                    {t("metadata.sgdbHowtoPre")}{" "}
                    <a href="https://www.steamgriddb.com/profile/preferences/api" target="_blank" rel="noreferrer" className={extLink}>
                      steamgriddb.com
                    </a>{" "}
                    {t("metadata.sgdbHowtoPost")}
                  </>
                }
                result={tests.steamgriddb}
                onTest={() => testProvider("steamgriddb")}
              >
                <input type="password" className="input-dark min-w-0 flex-1 basis-48 px-3 py-2 text-xs" placeholder={t("metadata.placeholderApiKey")} value={sgdbKey} onChange={(e) => setSgdbKey(e.target.value)} autoComplete="new-password" data-form-type="other" />
              </ProviderCard>

              <ProviderCard
                name="EmuMovies"
                badge={t("metadata.badgeSupporterAccount")}
                gives={t("metadata.emGives")}
                howto={
                  <>
                    {t("metadata.emHowtoPre")}{" "}
                    <a href="https://emumovies.com" target="_blank" rel="noreferrer" className={extLink}>
                      emumovies.com
                    </a>{" "}
                    {t("metadata.emHowtoPost")}
                  </>
                }
                result={tests.emumovies}
                onTest={() => testProvider("emumovies")}
              >
                <input className="input-dark min-w-0 flex-1 basis-36 px-3 py-2 text-xs" placeholder={t("metadata.placeholderUsername")} value={emUser} onChange={(e) => setEmUser(e.target.value)} autoComplete="off" data-form-type="other" />
                <input type="password" className="input-dark min-w-0 flex-1 basis-36 px-3 py-2 text-xs" placeholder={t("metadata.placeholderPassword")} value={emPass} onChange={(e) => setEmPass(e.target.value)} autoComplete="new-password" data-form-type="other" />
              </ProviderCard>

              <div className="rounded bg-black/25 p-4">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-sm font-semibold text-body">{t("metadata.alwaysOnTitle")}</span>
                  <span className="rounded bg-[#4c9e28]/20 px-1.5 py-0.5 text-[10px] font-bold uppercase text-[#8ce05f]">
                    {t("metadata.badgeFreeBuiltIn")}
                  </span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-dim">
                  <span className="text-body">libretro-thumbnails</span> {t("metadata.alwaysOnDesc1")}{" "}
                  <span className="text-body">Hasheous</span> {t("metadata.alwaysOnDesc2")}{" "}
                  <span className="text-body">HowLongToBeat</span> {t("metadata.alwaysOnDesc3")}{" "}
                  <span className="text-body">Flashpoint</span> {t("metadata.alwaysOnDesc4")}
                </p>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-between">
              <button onClick={next} className={skipBtn}>
                {t("common.skipForNow")}
              </button>
              <div className="flex items-center gap-3">
                {providerMsg && <span className="text-sm text-accent">{providerMsg}</span>}
                <button onClick={saveProviders} className={nextBtn}>
                  {t("common.saveAndContinue")} →
                </button>
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div>
            <h2 className="text-2xl font-bold text-bright">{t("steps.firstScan")}</h2>
            <p className="mt-1 text-sm text-dim">
              {t("firstScan.desc")}
            </p>

            <div className="mt-6 flex flex-col items-center gap-4 rounded bg-black/25 p-8 text-center">
              {scanning ? (
                <>
                  <div className="h-10 w-10 animate-spin rounded-full border-4 border-white/10 border-t-accent" />
                  <div className="text-sm text-body">{t("firstScan.scanningLibrary")}</div>
                </>
              ) : scanResult ? (
                <>
                  <div className="text-4xl text-[#59bf40]">✓</div>
                  <div className="text-lg font-bold text-bright">
                    {t("firstScan.gamesAdded", { count: scanResult.added })}
                  </div>
                  <div className="text-xs text-dim">
                    {t("firstScan.filesScanned", { count: scanResult.scanned })}
                  </div>
                  {!scrapeStarted ? (
                    <button onClick={startScrape} className="btn-gray cursor-pointer px-5 py-2 text-sm">
                      ⤵ {t("firstScan.startScraping")}
                    </button>
                  ) : (
                    <div className="text-xs text-accent">
                      ✓ {t("firstScan.scrapingBackground")}
                    </div>
                  )}
                </>
              ) : (
                <button onClick={runScan} className="btn-blue cursor-pointer px-8 py-3 text-sm">
                  ⟳ {t("firstScan.scanLibraryNow")}
                </button>
              )}
            </div>

            <div className="mt-6 flex items-center justify-between">
              <button onClick={next} className={skipBtn}>
                {t("common.skipForNow")}
              </button>
              <button onClick={next} disabled={scanning} className={`${nextBtn} disabled:opacity-50`}>
                {t("common.continue")} →
              </button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="text-center">
            <div className="text-5xl">🎉</div>
            <h2 className="mt-3 text-2xl font-bold text-bright">{t("done.heading")}</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-dim">
              {t("done.descPre")} <span className="text-body">Esc</span>{" "}
              {t("done.descPost")}
            </p>
            <button onClick={() => finish()} className={`${nextBtn} mt-8`}>
              {t("done.takeMeToLibrary")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
