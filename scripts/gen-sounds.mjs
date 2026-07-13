// Generates GameHub's UI sound effects as 16-bit/44.1kHz WAV files in
// public/sounds/. Every sound is synthesized from scratch by this script —
// they are original works dedicated to the public domain (CC0). No
// third-party (e.g. Valve/Steam) audio is used or derived from.
//
//   node scripts/gen-sounds.mjs

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const SR = 44100;
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "sounds");

// ---------- tiny synth ----------

/** Render a set of voices into one normalized mono buffer (seconds long). */
function render(seconds, voices) {
  const n = Math.ceil(seconds * SR);
  const buf = new Float64Array(n);
  for (const v of voices) v(buf);
  // gentle soft-clip, then normalize to a comfortable peak
  let peak = 0;
  for (let i = 0; i < n; i++) {
    buf[i] = Math.tanh(buf[i]);
    peak = Math.max(peak, Math.abs(buf[i]));
  }
  const g = peak > 0 ? 0.62 / peak : 1;
  for (let i = 0; i < n; i++) buf[i] *= g;
  return buf;
}

/**
 * Sine voice with optional pitch glide, harmonics and exponential decay.
 * start/dur in seconds; f0->f1 glide; harmonics = [[multiple, amplitude]].
 */
function tone({ start = 0, dur, f0, f1 = null, amp = 1, attack = 0.004, tau, harmonics = [[1, 1]], detune = 0 }) {
  return (buf) => {
    const s0 = Math.floor(start * SR);
    const N = Math.floor(dur * SR);
    let phase = 0;
    let phaseD = 0;
    for (let i = 0; i < N && s0 + i < buf.length; i++) {
      const t = i / SR;
      const frac = i / N;
      const f = f1 === null ? f0 : f0 * Math.pow(f1 / f0, frac); // exponential glide
      phase += (2 * Math.PI * f) / SR;
      phaseD += (2 * Math.PI * f * (1 + detune)) / SR;
      const env = Math.min(1, t / attack) * Math.exp(-t / tau);
      let s = 0;
      for (const [mult, a] of harmonics) s += a * Math.sin(phase * mult);
      if (detune) s = 0.6 * s + 0.4 * Math.sin(phaseD);
      buf[s0 + i] += amp * env * s;
    }
  };
}

/** Filtered-noise voice (one-pole low-pass with swept cutoff) for swooshes. */
function swoosh({ start = 0, dur, cutoff0, cutoff1, amp = 1, attack = 0.01, fadeOut = 0.4 }) {
  return (buf) => {
    const s0 = Math.floor(start * SR);
    const N = Math.floor(dur * SR);
    let seed = 1234567;
    const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x3fffffff) - 1;
    let y = 0;
    for (let i = 0; i < N && s0 + i < buf.length; i++) {
      const t = i / SR;
      const frac = i / N;
      const fc = cutoff0 * Math.pow(cutoff1 / cutoff0, frac);
      const alpha = 1 - Math.exp((-2 * Math.PI * fc) / SR);
      y += alpha * (rand() - y);
      const fadeIn = Math.min(1, t / attack);
      const out = frac > 1 - fadeOut ? (1 - frac) / fadeOut : 1;
      buf[s0 + i] += amp * fadeIn * out * y;
    }
  };
}

function writeWav(name, samples) {
  const n = samples.length;
  const data = Buffer.alloc(44 + n * 2);
  data.write("RIFF", 0);
  data.writeUInt32LE(36 + n * 2, 4);
  data.write("WAVEfmt ", 8);
  data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20); // PCM
  data.writeUInt16LE(1, 22); // mono
  data.writeUInt32LE(SR, 24);
  data.writeUInt32LE(SR * 2, 28);
  data.writeUInt16LE(2, 32);
  data.writeUInt16LE(16, 34);
  data.write("data", 36);
  data.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), 44 + i * 2);
  }
  fs.writeFileSync(path.join(OUT, name), data);
  console.log("  " + name, `(${(data.length / 1024).toFixed(1)} kB)`);
}

// ---------- the sounds ----------

const H_SOFT = [
  [1, 1],
  [2, 0.18],
  [3, 0.05],
]; // slightly warm sine

const sounds = {
  // cursor moved one item — the quietest, shortest tick
  "nav-tick.wav": render(0.07, [tone({ dur: 0.06, f0: 1850, tau: 0.016, amp: 0.7, harmonics: [[1, 1], [2, 0.12]] })]),

  // item pressed / activated
  "select.wav": render(0.14, [tone({ dur: 0.13, f0: 880, f1: 700, tau: 0.045, harmonics: H_SOFT })]),

  // modal / dialog opens — two rising soft tones
  "open.wav": render(0.22, [
    tone({ dur: 0.1, f0: 523, tau: 0.035, harmonics: H_SOFT, amp: 0.8 }),
    tone({ start: 0.055, dur: 0.14, f0: 740, tau: 0.05, harmonics: H_SOFT }),
  ]),

  // modal closes / back — mirror of open
  "close.wav": render(0.22, [
    tone({ dur: 0.1, f0: 740, tau: 0.035, harmonics: H_SOFT, amp: 0.8 }),
    tone({ start: 0.055, dur: 0.14, f0: 523, tau: 0.05, harmonics: H_SOFT }),
  ]),

  // side menu flies in — airy upward swoosh with a soft glide underneath
  "slide-in.wav": render(0.24, [
    swoosh({ dur: 0.22, cutoff0: 350, cutoff1: 2600, amp: 0.5 }),
    tone({ dur: 0.2, f0: 480, f1: 760, tau: 0.09, amp: 0.5, harmonics: H_SOFT }),
  ]),

  // side menu flies out
  "slide-out.wav": render(0.24, [
    swoosh({ dur: 0.22, cutoff0: 2600, cutoff1: 350, amp: 0.5 }),
    tone({ dur: 0.2, f0: 760, f1: 480, tau: 0.09, amp: 0.5, harmonics: H_SOFT }),
  ]),

  // entering a game's detail page — gentle rise
  "zoom-in.wav": render(0.26, [tone({ dur: 0.24, f0: 440, f1: 660, tau: 0.1, harmonics: H_SOFT, detune: 0.002 })]),

  // leaving back to the library — gentle fall
  "zoom-out.wav": render(0.26, [tone({ dur: 0.24, f0: 660, f1: 440, tau: 0.1, harmonics: H_SOFT, detune: 0.002 })]),

  // launching a game — bright ascending arpeggio over a low pad
  "launch.wav": render(0.7, [
    tone({ dur: 0.65, f0: 131, tau: 0.28, amp: 0.5, harmonics: H_SOFT }),
    tone({ start: 0.0, dur: 0.3, f0: 262, tau: 0.14, harmonics: H_SOFT }),
    tone({ start: 0.09, dur: 0.3, f0: 330, tau: 0.14, harmonics: H_SOFT }),
    tone({ start: 0.18, dur: 0.3, f0: 392, tau: 0.14, harmonics: H_SOFT }),
    tone({ start: 0.27, dur: 0.4, f0: 523, tau: 0.2, harmonics: H_SOFT }),
  ]),

  // toggle on — quick pair up
  "toggle-on.wav": render(0.16, [
    tone({ dur: 0.08, f0: 620, tau: 0.025, harmonics: H_SOFT, amp: 0.8 }),
    tone({ start: 0.055, dur: 0.1, f0: 930, tau: 0.035, harmonics: H_SOFT }),
  ]),

  // toggle off — quick pair down
  "toggle-off.wav": render(0.16, [
    tone({ dur: 0.08, f0: 930, tau: 0.025, harmonics: H_SOFT, amp: 0.8 }),
    tone({ start: 0.055, dur: 0.1, f0: 620, tau: 0.035, harmonics: H_SOFT }),
  ]),

  // switching tabs — mid tick, a touch fuller than nav
  "tab.wav": render(0.09, [tone({ dur: 0.08, f0: 1250, tau: 0.022, harmonics: [[1, 1], [2, 0.15]] })]),

  // on-screen keyboard keypress — soft low "tok" with a tiny click transient
  // (the default for when no SteamOS audio pack supplies deck_ui_typing.wav)
  "key-type.wav": render(0.05, [
    tone({ dur: 0.035, f0: 430, tau: 0.012, amp: 0.7, harmonics: [[1, 1], [2, 0.22]] }),
    swoosh({ dur: 0.012, cutoff0: 2400, cutoff1: 700, amp: 0.22 }),
  ]),

  // toast / notification — small two-note bell
  "notify.wav": render(0.55, [
    tone({ dur: 0.09, f0: 880, tau: 0.04, amp: 0.6, harmonics: H_SOFT }),
    tone({ start: 0.07, dur: 0.45, f0: 1175, tau: 0.16, harmonics: [[1, 1], [2.76, 0.25], [5.4, 0.08]] }),
  ]),

  // hit the end of a list — dull low bump
  "bump.wav": render(0.14, [
    tone({ dur: 0.12, f0: 150, f1: 105, tau: 0.045, harmonics: [[1, 1], [2, 0.3]] }),
    swoosh({ dur: 0.03, cutoff0: 900, cutoff1: 300, amp: 0.25 }),
  ]),

  // success / confirmation — two-note chime up
  "confirm.wav": render(0.4, [
    tone({ dur: 0.14, f0: 784, tau: 0.06, harmonics: H_SOFT, amp: 0.85 }),
    tone({ start: 0.1, dur: 0.3, f0: 1046, tau: 0.12, harmonics: H_SOFT }),
  ]),

  // app startup — slow ambient swell (A-add9), shimmer, long fade
  "startup.wav": render(2.4, [
    tone({ dur: 2.3, f0: 110, tau: 1.1, attack: 0.5, amp: 0.55, harmonics: H_SOFT, detune: 0.0015 }),
    tone({ dur: 2.2, f0: 220, tau: 1.0, attack: 0.45, amp: 0.5, harmonics: H_SOFT, detune: 0.002 }),
    tone({ start: 0.25, dur: 2.0, f0: 277, tau: 0.9, attack: 0.4, amp: 0.4, harmonics: H_SOFT, detune: 0.002 }),
    tone({ start: 0.5, dur: 1.8, f0: 330, tau: 0.85, attack: 0.35, amp: 0.38, harmonics: H_SOFT, detune: 0.002 }),
    tone({ start: 0.8, dur: 1.5, f0: 440, tau: 0.7, attack: 0.3, amp: 0.32, harmonics: H_SOFT, detune: 0.003 }),
    tone({ start: 1.05, dur: 1.3, f0: 494, tau: 0.6, attack: 0.25, amp: 0.22, harmonics: H_SOFT, detune: 0.003 }),
  ]),
};

fs.mkdirSync(OUT, { recursive: true });
console.log("Generating UI sounds into public/sounds/:");
for (const [name, samples] of Object.entries(sounds)) writeWav(name, samples);
console.log("Done —", Object.keys(sounds).length, "files.");
