// Monochrome white line/glyph icons for the Settings menu — one per section key
// (Steam Big Picture uses clean white glyphs, not colorful emoji). Shared by the
// desktop rail (SettingsShell) and the mobile settings list so both render the
// same white icons. 20px, currentColor.

import type { ReactNode } from "react";

const I = "h-5 w-5";

export const SETTINGS_ICONS: Record<string, ReactNode> = {
  system: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={I}><rect x="3" y="4" width="18" height="12" rx="1" /><path d="M2 20h20" /></svg>,
  library: <svg viewBox="0 0 24 24" fill="currentColor" className={I}><path d="M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9 0h7v7h-7v-7Z" /></svg>,
  maintenance: <svg viewBox="0 0 24 24" fill="currentColor" className={I}><path d="M21.7 5.6a1 1 0 0 0-1.6-.3l-2.5 2.5-2.4-.4-.4-2.4 2.5-2.5a1 1 0 0 0-.3-1.6 5.5 5.5 0 0 0-7.1 6.9l-6.1 6.1a2.4 2.4 0 0 0 3.4 3.4l6.1-6.1a5.5 5.5 0 0 0 6.9-7.1Z" /></svg>,
  scraping: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={I}><path d="M12 3v9m0 0-3.5-3.5M12 12l3.5-3.5" /><path d="M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3" /></svg>,
  providers: <svg viewBox="0 0 24 24" fill="currentColor" className={I}><path d="M7 18a4 4 0 0 1-.5-8A5 5 0 0 1 16 9.5a3.5 3.5 0 0 1 .5 8.5H7Z" /></svg>,
  firmware: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={I}><rect x="6" y="6" width="12" height="12" rx="1.5" /><path d="M9 9h6v6H9zM3 9h3M3 15h3M18 9h3M18 15h3M9 3v3M15 3v3M9 18v3M15 18v3" /></svg>,
  news: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={I}><path d="M4 5h13v14H5a2 2 0 0 1-2-2V6a1 1 0 0 1 1-1Z" /><path d="M17 8h3v9a2 2 0 0 1-2 2M7 9h6M7 12h6M7 15h4" strokeLinecap="round" /></svg>,
  automation: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={I}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  reports: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={I}><path d="M4 20V4M4 20h16" strokeLinecap="round" /><rect x="7" y="12" width="3" height="5" fill="currentColor" stroke="none" /><rect x="12" y="8" width="3" height="9" fill="currentColor" stroke="none" /><rect x="17" y="10" width="3" height="7" fill="currentColor" stroke="none" /></svg>,
  activity: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={I}><path d="M3 12h4l2 6 4-14 2 8h6" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  customization: <svg viewBox="0 0 24 24" fill="currentColor" className={I}><path d="m12 2 1.5 4.5L18 8l-4.5 1.5L12 14l-1.5-4.5L6 8l4.5-1.5L12 2ZM6 15l.8 2.2L9 18l-2.2.8L6 21l-.8-2.2L3 18l2.2-.8L6 15Z" /></svg>,
  audio: <svg viewBox="0 0 24 24" fill="currentColor" className={I}><path d="M11 5 6 9H3v6h3l5 4V5Z" /><path d="M15 9a3 3 0 0 1 0 6" fill="none" stroke="currentColor" strokeWidth="1.8" /></svg>,
  controller: <svg viewBox="0 0 24 24" fill="currentColor" className={I}><path d="M6 8a4 4 0 0 0-4 4v2a3 3 0 0 0 5.8 1.1L8.6 14h6.8l.8 1.1A3 3 0 0 0 22 14v-2a4 4 0 0 0-4-4H6Zm1 2.5h1.5V12H10v1.5H8.5V15H7v-1.5H5.5V12H7v-1.5Zm9.5.5a1 1 0 1 1 0 2 1 1 0 0 1 0-2Zm2 3a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z" /></svg>,
  keyboard: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={I}><rect x="2" y="6" width="20" height="12" rx="1.5" /><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8" /></svg>,
  accessibility: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={I}><circle cx="12" cy="4.5" r="1.6" fill="currentColor" /><path d="M4 8h16M12 8v6m0 0-3 6m3-6 3 6" /></svg>,
  language: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={I}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.4 3.8 5.7 3.8 9s-1.3 6.6-3.8 9c-2.5-2.4-3.8-5.7-3.8-9s1.3-6.6 3.8-9Z" strokeLinejoin="round" /></svg>,
  users: <svg viewBox="0 0 24 24" fill="currentColor" className={I}><circle cx="8" cy="8" r="3" /><circle cx="17" cy="9" r="2.4" /><path d="M2 19a6 6 0 0 1 12 0v1H2v-1Zm13-1a5 5 0 0 1 7 1v1h-6" /></svg>,
  "age-restrictions": <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={I}><path d="M12 3 5 6v5c0 4.5 3 7.7 7 9.5 4-1.8 7-5 7-9.5V6l-7-3Z" strokeLinejoin="round" /><path d="M9 11.5 11.2 13.7 15 9.5" strokeLinecap="round" strokeLinejoin="round" /></svg>,
};
