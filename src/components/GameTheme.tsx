"use client";

// Plays the game's title theme while its detail page is open: an uploaded
// audio file if one exists, otherwise the auto-matched YouTube video through
// an invisible embed. Fades in, stops on navigation, and obeys the
// "Game theme music" toggle in Quick Access (live).

import { useEffect, useRef, useState } from "react";
import { themeMusicEnabled } from "@/lib/sounds";

const TARGET_VOLUME = 0.35; // 0..1 for <audio>; YouTube uses 0..100

interface YtPlayer {
  setVolume(v: number): void;
  playVideo(): void;
  pauseVideo?(): void;
  stopVideo(): void;
  destroy(): void;
  getPlayerState?(): number;
}

interface YtApi {
  Player: new (
    el: HTMLElement,
    opts: {
      videoId: string;
      width: number;
      height: number;
      playerVars: Record<string, number>;
      events: {
        onReady: (e: { target: YtPlayer }) => void;
        onStateChange?: (e: { data: number; target: YtPlayer }) => void;
      };
    }
  ) => YtPlayer;
  PlayerState: { PLAYING: number };
}

declare global {
  interface Window {
    YT?: YtApi;
    onYouTubeIframeAPIReady?: () => void;
  }
}

function loadYouTubeApi(): Promise<YtApi> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  return new Promise((resolve) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      if (window.YT) resolve(window.YT);
    };
    if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
      const s = document.createElement("script");
      s.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(s);
    }
  });
}

export default function GameTheme({
  romId,
  themeUrl,
}: {
  romId: number;
  themeUrl: string | null;
}) {
  const [enabled, setEnabled] = useState(false);
  const holder = useRef<HTMLDivElement>(null);
  // The currently-playing source (whichever kind), so the suspend listener can
  // pause/resume it without re-running the playback effect.
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playerRef = useRef<YtPlayer | null>(null);
  const enabledRef = useRef(enabled);
  const suspendedRef = useRef(false);

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  useEffect(() => {
    setEnabled(themeMusicEnabled());
    const onToggle = (e: Event) =>
      setEnabled((e as CustomEvent).detail?.on ?? themeMusicEnabled());
    window.addEventListener("gh-thememusic", onToggle);
    return () => window.removeEventListener("gh-thememusic", onToggle);
  }, []);

  // A trailer/video (MediaGallery) asks us to hush while it plays, then resume.
  useEffect(() => {
    const onSuspend = (e: Event) => {
      const suspend = !!(e as CustomEvent).detail;
      suspendedRef.current = suspend;
      try {
        if (suspend) {
          audioRef.current?.pause();
          playerRef.current?.pauseVideo?.();
        } else if (enabledRef.current) {
          audioRef.current?.play().catch(() => {});
          playerRef.current?.playVideo();
        }
      } catch {}
    };
    window.addEventListener("gh-theme-suspend", onSuspend);
    return () => window.removeEventListener("gh-theme-suspend", onSuspend);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let audio: HTMLAudioElement | null = null;
    let player: YtPlayer | null = null;
    let fade: ReturnType<typeof setInterval> | null = null;
    // If autoplay is blocked (no interaction with the app yet), retry on the
    // first click/keypress instead of staying silent
    let retry: (() => void) | null = null;

    const fadeIn = (set: (v: number) => void, max: number) => {
      let v = 0;
      set(0);
      fade = setInterval(() => {
        v = Math.min(max, v + max / 12);
        try {
          set(v);
        } catch {}
        if (v >= max && fade) clearInterval(fade);
      }, 100);
    };

    const armRetry = (start: () => void) => {
      retry = () => {
        retry = null;
        if (!cancelled) start();
      };
      window.addEventListener("pointerdown", onGesture);
      window.addEventListener("keydown", onGesture);
    };
    const onGesture = () => {
      window.removeEventListener("pointerdown", onGesture);
      window.removeEventListener("keydown", onGesture);
      retry?.();
    };

    (async () => {
      if (themeUrl) {
        audio = new Audio(themeUrl);
        audio.preload = "auto";
        audioRef.current = audio;
        const start = () => {
          if (!audio || suspendedRef.current) return; // a trailer is playing — stay quiet
          audio
            .play()
            .then(() => fadeIn((v) => (audio!.volume = v), TARGET_VOLUME))
            .catch(() => armRetry(start));
        };
        start();
        return;
      }

      // Resolve the YouTube match (cached server-side after the first hit)
      const res = await fetch(`/api/roms/${romId}/theme`).catch(() => null);
      if (cancelled || !res?.ok) return;
      const data = await res.json().catch(() => null);
      if (cancelled || data?.type !== "youtube" || !data.videoId) return;

      const YT = await loadYouTubeApi();
      if (cancelled || !holder.current) return;
      const mount = document.createElement("div");
      holder.current.appendChild(mount);
      player = new YT.Player(mount, {
        videoId: data.videoId,
        width: 200,
        height: 112,
        playerVars: { autoplay: 1, controls: 0, disablekb: 1, rel: 0, playsinline: 1 },
        events: {
          onReady: (e) => {
            if (cancelled) return;
            playerRef.current = e.target;
            if (suspendedRef.current) return; // a trailer is playing — stay quiet
            e.target.setVolume(0);
            e.target.playVideo();
            fadeIn((v) => e.target.setVolume(Math.round(v * 100)), TARGET_VOLUME);
            // Autoplay blocked? Start on the next interaction.
            setTimeout(() => {
              if (
                !cancelled &&
                window.YT &&
                e.target.getPlayerState?.() !== window.YT.PlayerState.PLAYING
              ) {
                armRetry(() => {
                  e.target.setVolume(Math.round(TARGET_VOLUME * 100));
                  e.target.playVideo();
                });
              }
            }, 2000);
          },
        },
      });
    })();

    return () => {
      cancelled = true;
      if (fade) clearInterval(fade);
      window.removeEventListener("pointerdown", onGesture);
      window.removeEventListener("keydown", onGesture);
      if (audio) {
        audio.pause();
        audio.src = "";
      }
      try {
        player?.stopVideo();
        player?.destroy();
      } catch {}
      audioRef.current = null;
      playerRef.current = null;
      if (holder.current) holder.current.innerHTML = "";
    };
  }, [enabled, romId, themeUrl]);

  return (
    <div
      ref={holder}
      aria-hidden
      className="pointer-events-none fixed bottom-0 right-0 h-px w-px overflow-hidden opacity-0"
    />
  );
}
