"use client";

// AudioLoader runtime — publishes the active sound pack to window.__GH_AUDIO
// (read by lib/sounds.ts to resolve every UI sound through the pack) and
// runs the menu-music player: optional intro_music.mp3 once, then
// menu_music.mp3 looped, paused while a game is running (/play), exactly
// like SDH-AudioLoader's changeMenuMusic + AppLifetimeNotifications flow.

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { soundsEnabled } from "@/lib/sounds";

export interface AudioManagerData {
  sound: { dir: string; ignore: string[]; mappings: Record<string, string[]> } | null;
  music: { dir: string; mappings: Record<string, string[]>; hasIntro: boolean } | null;
  soundVolume: number;
  musicVolume: number;
}

function mapped(file: string, mappings: Record<string, string[]>): string {
  const alts = mappings[file];
  if (Array.isArray(alts) && alts.length > 0) {
    return alts[Math.trunc(Math.random() * alts.length)];
  }
  return file;
}

export default function AudioManager({ data }: { data: AudioManagerData }) {
  const pathname = usePathname();
  const player = useRef<HTMLAudioElement | null>(null);
  const inGame = pathname.startsWith("/play");

  // publish the sound pack for lib/sounds.ts
  useEffect(() => {
    window.__GH_AUDIO = { sound: data.sound, soundVolume: data.soundVolume };
    return () => {
      window.__GH_AUDIO = undefined;
    };
  }, [data.sound, data.soundVolume]);

  // menu music lifecycle
  useEffect(() => {
    // stop the old player on pack change/unmount
    if (player.current) {
      player.current.pause();
      player.current = null;
    }
    if (!data.music || !soundsEnabled()) return;

    const dir = data.music.dir;
    const musicUrl = `/sounds_custom/${dir}/${mapped("menu_music.mp3", data.music.mappings)}`;
    const introUrl = `/sounds_custom/${dir}/${mapped("intro_music.mp3", data.music.mappings)}`;

    const audio = new Audio(data.music.hasIntro ? introUrl : musicUrl);
    audio.volume = data.musicVolume;
    player.current = audio;

    if (data.music.hasIntro) {
      audio.onended = () => {
        audio.src = musicUrl;
        audio.onended = null;
        audio.loop = true;
        void audio.play().catch(() => {});
      };
    } else {
      audio.loop = true;
    }

    // browsers block autoplay before a user gesture — retry on first input
    const tryPlay = () => {
      void audio.play().catch(() => {
        window.addEventListener("pointerdown", tryPlay, { once: true });
        window.addEventListener("keydown", tryPlay, { once: true });
      });
    };
    if (!inGame) tryPlay();

    return () => {
      audio.pause();
      window.removeEventListener("pointerdown", tryPlay);
      window.removeEventListener("keydown", tryPlay);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.music?.dir, data.musicVolume]);

  // pause while a game runs, resume after (AppLifetimeNotifications analog)
  useEffect(() => {
    const audio = player.current;
    if (!audio) return;
    if (inGame) audio.pause();
    else void audio.play().catch(() => {});
  }, [inGame]);

  return null;
}
