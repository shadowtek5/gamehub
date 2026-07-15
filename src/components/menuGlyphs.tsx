// White monochrome line/glyph icons for the context menus (game options, system
// tools, and their mobile bottom-sheet equivalents). Steam Big Picture menus use
// clean white glyphs, not colorful emoji — these keep every menu row uniform.
// Each takes a color className (e.g. "text-dim"/"text-accent"); size is fixed.

type P = { className?: string };
const base = (c = "") => `h-[18px] w-[18px] shrink-0 ${c}`.trim();

export const GStar = ({ className }: P) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={base(className)}><path d="m12 2.5 2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 18.9 6.1 21l1.2-6.5L2.5 9.4l6.6-.9L12 2.5Z" /></svg>
);
export const GList = ({ className }: P) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={base(className)}><path d="M4 6h11M4 12h11M4 18h7M18 13v6M15 16h6" strokeLinecap="round" /></svg>
);
export const GHome = ({ className }: P) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={base(className)}><path d="M4 11.5 12 4l8 7.5M6 10v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-9" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
export const GFriends = ({ className }: P) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={base(className)}><circle cx="9" cy="8" r="3" /><path d="M3.5 20a5.5 5.5 0 0 1 11 0" strokeLinecap="round" /><path d="M16 5.2A3 3 0 0 1 16 11M17 14.2a5.5 5.5 0 0 1 3.5 5.1" strokeLinecap="round" /></svg>
);
export const GPower = ({ className }: P) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={base(className)}><path d="M12 3v9" strokeLinecap="round" /><path d="M7.5 6.5a7 7 0 1 0 9 0" strokeLinecap="round" /></svg>
);
export const GEye = ({ className }: P) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={base(className)}><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="2.6" /></svg>
);
export const GEyeOff = ({ className }: P) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={base(className)}><path d="M4 4l16 16M9.5 9.6A2.6 2.6 0 0 0 12 14.6M6.3 6.4C3.9 7.9 2 12 2 12s4 7 10 7a9.7 9.7 0 0 0 3.7-.7M17.5 16.4C20 14.9 22 12 22 12s-4-7-10-7a9.7 9.7 0 0 0-2 .2" strokeLinecap="round" /></svg>
);
export const GBook = ({ className }: P) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={base(className)}><path d="M4 5a1 1 0 0 1 1-1h6v15H5a1 1 0 0 0-1 1V5Zm16 0a1 1 0 0 0-1-1h-6v15h6a1 1 0 0 1 1 1V5Z" strokeLinejoin="round" /></svg>
);
export const GDownload = ({ className }: P) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={base(className)}><path d="M12 3v11m0 0-4-4m4 4 4-4M5 20h14" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
export const GUpload = ({ className }: P) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={base(className)}><path d="M12 21V10m0 0-4 4m4-4 4 4M5 4h14" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
export const GScrape = ({ className }: P) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={base(className)}><path d="M12 3v9m0 0-3.5-3.5M12 12l3.5-3.5" /><path d="M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3" strokeLinecap="round" /></svg>
);
export const GBackfill = ({ className }: P) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={base(className)}><path d="M12 3v12m0 0-4-4m4 4 4-4M4 20h16" strokeLinecap="round" strokeLinejoin="round" /><path d="M7 6h10" strokeLinecap="round" opacity="0.5" /></svg>
);
export const GTarget = ({ className }: P) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={base(className)}><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3.2" /><path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3" strokeLinecap="round" /></svg>
);
export const GBoxArt = ({ className }: P) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={base(className)}><rect x="4" y="4" width="16" height="16" rx="1.5" /><path d="M4 15l4-4 4 4 3-3 5 5" strokeLinecap="round" strokeLinejoin="round" /><circle cx="9" cy="9" r="1.4" fill="currentColor" stroke="none" /></svg>
);
export const GHeroArt = ({ className }: P) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={base(className)}><rect x="3" y="6" width="18" height="12" rx="1.5" /><path d="M3 15l4-3 4 3 3-2 7 4" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
export const GPencil = ({ className }: P) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={base(className)}><path d="M4 20h4L19 9a2 2 0 0 0-3-3L5 17v3Z" strokeLinejoin="round" /><path d="M14.5 7.5 17 10" /></svg>
);
export const GFilm = ({ className }: P) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={base(className)}><rect x="3" y="5" width="18" height="14" rx="1.5" /><path d="M7 5v14M17 5v14M3 9.5h4M3 14.5h4M17 9.5h4M17 14.5h4" strokeLinecap="round" /></svg>
);
export const GBandage = ({ className }: P) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={base(className)}><rect x="1.5" y="8.5" width="21" height="7" rx="3.5" transform="rotate(-45 12 12)" /><path d="M9.5 9.5l5 5" strokeLinecap="round" /><circle cx="12" cy="12" r="0.6" fill="currentColor" stroke="none" /></svg>
);
export const GGear = ({ className }: P) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={base(className)}><circle cx="12" cy="12" r="3.2" /><path d="M12 3v2.5M12 18.5V21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M3 12h2.5M18.5 12H21M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8" strokeLinecap="round" /></svg>
);
export const GCheck = ({ className }: P) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className={base(className)}><path d="M5 12.5 10 17.5 19 6.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
export const GCloud = ({ className }: P) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={base(className)}><path d="M7 18a4 4 0 0 1-.5-8A5 5 0 0 1 16 9.5a3.5 3.5 0 0 1 .5 8.5H7Z" strokeLinejoin="round" /></svg>
);
export const GBroom = ({ className }: P) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={base(className)}><path d="M19 4 11 12M8.5 9.5 5 13c-1.5 1.5-1.5 4 0 5.5S9 20 10.5 18.5L14 15M6 16l2 2" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
export const GGamepad = ({ className }: P) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={base(className)}><path d="M6 8a4 4 0 0 0-4 4v2a3 3 0 0 0 5.8 1.1L8.6 14h6.8l.8 1.1A3 3 0 0 0 22 14v-2a4 4 0 0 0-4-4H6Zm1 2.5h1.5V12H10v1.5H8.5V15H7v-1.5H5.5V12H7v-1.5Zm9.5.5a1 1 0 1 1 0 2 1 1 0 0 1 0-2Zm2 3a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z" /></svg>
);
export const GRevert = ({ className }: P) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={base(className)}><path d="M4 12a8 8 0 1 0 2.3-5.6M4 4v3.6h3.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
export const GDisc = ({ className }: P) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={base(className)}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="2.6" /><path d="M12 3a9 9 0 0 1 8 5" strokeLinecap="round" opacity="0.6" /></svg>
);
export const GRefresh = ({ className }: P) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={base(className)}><path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v3.6h-3.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
export const GIcon = ({ className }: P) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={base(className)}><rect x="4" y="4" width="16" height="16" rx="4" /><circle cx="12" cy="12" r="3.4" /></svg>
);
export const GInfo = ({ className }: P) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={base(className)}><circle cx="12" cy="12" r="9" /><path d="M12 11v5" strokeLinecap="round" /><circle cx="12" cy="7.8" r="1.1" fill="currentColor" stroke="none" /></svg>
);
export const GFirmware = ({ className }: P) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={base(className)}><rect x="6" y="6" width="12" height="12" rx="1.5" /><rect x="9.5" y="9.5" width="5" height="5" rx="0.5" fill="currentColor" stroke="none" /><path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3" strokeLinecap="round" /></svg>
);
