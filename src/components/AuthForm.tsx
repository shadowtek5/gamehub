"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { playSound } from "@/lib/sounds";

export default function AuthForm({ firstRun }: { firstRun: boolean }) {
  const t = useTranslations("auth.authForm");
  const [mode, setMode] = useState<"login" | "register">(
    firstRun ? "register" : "login"
  );
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      // Invite links (/login?invite=…) carry a pre-assigned role
      const invite = new URLSearchParams(window.location.search).get("invite") ?? undefined;
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, invite }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? t("somethingWentWrong"));
        return;
      }
      playSound("startup");
      router.push("/");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="panel p-6 shadow-2xl">
      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-accent">
        {t("username")}
      </label>
      <input
        className="input-dark mb-4 w-full px-3 py-2"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        autoComplete="username"
        autoFocus
      />
      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-accent">
        {t("password")}
      </label>
      <input
        type="password"
        className="input-dark mb-4 w-full px-3 py-2"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete={mode === "login" ? "current-password" : "new-password"}
      />
      {error && <p className="mb-3 text-sm text-danger">{error}</p>}
      <button
        type="submit"
        disabled={busy}
        className="btn-blue w-full cursor-pointer py-2.5 disabled:opacity-50"
      >
        {busy ? "…" : mode === "login" ? t("signIn") : t("createAccount")}
      </button>
      {!firstRun && (
        <p className="mt-4 text-center text-xs text-dim">
          {mode === "login" ? t("noAccount") : t("alreadyHaveAccount")}{" "}
          <button
            type="button"
            onClick={() => setMode(mode === "login" ? "register" : "login")}
            className="cursor-pointer text-accent hover:underline"
          >
            {mode === "login" ? t("createOne") : t("signIn")}
          </button>
        </p>
      )}
    </form>
  );
}
