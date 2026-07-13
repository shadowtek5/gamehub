"use client";

// SteamOS settings, built to the geometry measured from a live Big Picture
// capture (refs/steam-captures/settings-outline.txt):
//   rail: 270px on #2b2d33, 40px top pad, 42px rows (10px/31px padding),
//         20px icon + 16px gap, 16px/400 label; the ACTIVE row gets a
//         left-anchored blue gradient wash and its content scales 1.1x
//   content: ~37px gutter, sections 24px apart with 36px-tall 16px/500
//            subheaders; rows are #23262e, radius 2, 12px padding

import { useState } from "react";
import { playSound } from "@/lib/sounds";

// Monochrome line icons for the rail (Steam uses clean white glyphs, not
// colorful emoji). Keyed by section key; 20px, currentColor.
const I = "h-5 w-5";
const RAIL_ICONS: Record<string, React.ReactNode> = {
  system: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={I}><rect x="3" y="4" width="18" height="12" rx="1" /><path d="M2 20h20" /></svg>,
  internet: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={I}><path d="M5 13a10 10 0 0 1 14 0M8.5 16.5a5 5 0 0 1 7 0" /><circle cx="12" cy="20" r="1" fill="currentColor" /></svg>,
  scraping: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={I}><path d="M12 3v9m0 0-3.5-3.5M12 12l3.5-3.5" /><path d="M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3" /></svg>,
  providers: <svg viewBox="0 0 24 24" fill="currentColor" className={I}><path d="M7 18a4 4 0 0 1-.5-8A5 5 0 0 1 16 9.5a3.5 3.5 0 0 1 .5 8.5H7Z" /></svg>,
  firmware: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={I}><rect x="6" y="6" width="12" height="12" rx="1.5" /><path d="M9 9h6v6H9zM3 9h3M3 15h3M18 9h3M18 15h3M9 3v3M15 3v3M9 18v3M15 18v3" /></svg>,
  users: <svg viewBox="0 0 24 24" fill="currentColor" className={I}><circle cx="8" cy="8" r="3" /><circle cx="17" cy="9" r="2.4" /><path d="M2 19a6 6 0 0 1 12 0v1H2v-1Zm13-1a5 5 0 0 1 7 1v1h-6" /></svg>,
  "age-restrictions": <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={I}><path d="M12 3 5 6v5c0 4.5 3 7.7 7 9.5 4-1.8 7-5 7-9.5V6l-7-3Z" strokeLinejoin="round" /><path d="M9 11.5 11.2 13.7 15 9.5" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  notifications: <svg viewBox="0 0 24 24" fill="currentColor" className={I}><path d="M12 2a6 6 0 0 0-6 6v3.2L4.3 15a1 1 0 0 0 .9 1.5h13.6a1 1 0 0 0 .9-1.5L18 11.2V8a6 6 0 0 0-6-6Zm0 20a2.8 2.8 0 0 0 2.7-2H9.3A2.8 2.8 0 0 0 12 22Z" /></svg>,
  display: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={I}><rect x="3" y="4" width="18" height="12" rx="1" /><path d="M8 20h8M12 16v4" /></svg>,
  audio: <svg viewBox="0 0 24 24" fill="currentColor" className={I}><path d="M11 5 6 9H3v6h3l5 4V5Z" /><path d="M15 9a3 3 0 0 1 0 6" fill="none" stroke="currentColor" strokeWidth="1.8" /></svg>,
  controller: <svg viewBox="0 0 24 24" fill="currentColor" className={I}><path d="M6 8a4 4 0 0 0-4 4v2a3 3 0 0 0 5.8 1.1L8.6 14h6.8l.8 1.1A3 3 0 0 0 22 14v-2a4 4 0 0 0-4-4H6Zm1 2.5h1.5V12H10v1.5H8.5V15H7v-1.5H5.5V12H7v-1.5Zm9.5.5a1 1 0 1 1 0 2 1 1 0 0 1 0-2Zm2 3a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z" /></svg>,
  keyboard: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={I}><rect x="2" y="6" width="20" height="12" rx="1.5" /><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8" /></svg>,
  customization: <svg viewBox="0 0 24 24" fill="currentColor" className={I}><path d="m12 2 1.5 4.5L18 8l-4.5 1.5L12 14l-1.5-4.5L6 8l4.5-1.5L12 2ZM6 15l.8 2.2L9 18l-2.2.8L6 21l-.8-2.2L3 18l2.2-.8L6 15Z" /></svg>,
  accessibility: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={I}><circle cx="12" cy="4.5" r="1.6" fill="currentColor" /><path d="M4 8h16M12 8v6m0 0-3 6m3-6 3 6" /></svg>,
  friends: <svg viewBox="0 0 24 24" fill="currentColor" className={I}><path d="M4 5h13a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H9l-4 3v-3H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" /></svg>,
  downloads: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={I}><path d="M12 3v11m0 0-4-4m4 4 4-4M5 20h14" /></svg>,
  cloud: <svg viewBox="0 0 24 24" fill="currentColor" className={I}><path d="M7 18a4 4 0 0 1-.5-8A5 5 0 0 1 16 9.5a3.5 3.5 0 0 1 .5 8.5H7Z" /></svg>,
  ingame: <svg viewBox="0 0 24 24" fill="currentColor" className={I}><path d="M4 4v16l14-8L4 4Z" /></svg>,
  family: <svg viewBox="0 0 24 24" fill="currentColor" className={I}><circle cx="8" cy="8" r="3" /><circle cx="17" cy="9" r="2.4" /><path d="M2 19a6 6 0 0 1 12 0v1H2v-1Zm13-1a5 5 0 0 1 7 1v1h-6" /></svg>,
  remoteplay: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={I}><path d="M4 8a12 12 0 0 1 12 12M4 13a7 7 0 0 1 7 7" /><circle cx="4.5" cy="19.5" r="1.4" fill="currentColor" /><rect x="3" y="4" width="18" height="12" rx="1.5" /></svg>,
  storage: <svg viewBox="0 0 24 24" fill="currentColor" className={I}><path d="M4 5h16a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm2 12h12v2H6v-2Zm11-9a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z" /></svg>,
  voice: <svg viewBox="0 0 24 24" fill="currentColor" className={I}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M6 11a6 6 0 0 0 12 0M12 17v4" fill="none" stroke="currentColor" strokeWidth="1.8" /></svg>,
  recording: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={I}><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" fill="currentColor" /></svg>,
  home: <svg viewBox="0 0 24 24" fill="currentColor" className={I}><path d="M12 3 2 12h3v8a1 1 0 0 0 1 1h5v-6h2v6h5a1 1 0 0 0 1-1v-8h3L12 3Z" /></svg>,
  library: <svg viewBox="0 0 24 24" fill="currentColor" className={I}><path d="M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9 0h7v7h-7v-7Z" /></svg>,
  automation: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={I}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  reports: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={I}><path d="M4 20V4M4 20h16" strokeLinecap="round" /><rect x="7" y="12" width="3" height="5" fill="currentColor" stroke="none" /><rect x="12" y="8" width="3" height="9" fill="currentColor" stroke="none" /><rect x="17" y="10" width="3" height="7" fill="currentColor" stroke="none" /></svg>,
  activity: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={I}><path d="M3 12h4l2 6 4-14 2 8h6" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  store: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={I}><path d="M3 5h2l2 11h10l2-8H6M9 20a1 1 0 1 0 0-.01M17 20a1 1 0 1 0 0-.01" /></svg>,
  interface: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={I}><rect x="3" y="4" width="18" height="12" rx="1" /><path d="M8 20h8M12 16v4" /></svg>,
};

export interface SettingsSection {
  key: string;
  label: string;
  icon: string;
  content: React.ReactNode;
}

/** `"divider"` entries render the measured 1px separator in the rail */
export type SettingsEntry = SettingsSection | "divider";

export default function SettingsShell({ sections }: { sections: SettingsEntry[] }) {
  const pages = sections.filter((s): s is SettingsSection => s !== "divider");
  const [active, setActive] = useState(pages[0]?.key);
  const current = pages.find((s) => s.key === active) ?? pages[0];

  return (
    // BPM model: the page never scrolls — rail and content are independent
    // scroll panes spanning under the transparent header down to the footer;
    // each clears the 40px header with its own top padding.
    <div className="gamepadpagedsettings_PagedSettingsDialog_gh bpm-viewport flex flex-col md:flex-row">
      {/* Page list rail: own scroll region on #2b2d33, content starting
          below the header (measured rail top pad ~40px past the header) */}
      <nav className="gamepadpagedsettings_PagedSettingsDialog_PageListColumn_gh h-full w-full shrink-0 overflow-y-auto scroll-pt-[80px] scroll-pb-[52px] bg-[#2b2d33] pt-[80px] md:w-[270px]">
        <div className="flex flex-row overflow-x-auto pb-4 md:flex-col md:overflow-x-visible">
          {sections.map((s, i) => {
            if (s === "divider") {
              return (
                <div
                  key={`div-${i}`}
                  className="gamepadpagedsettings_Separator_gh mx-[31px] my-2 hidden h-px shrink-0 bg-white/10 md:block"
                  aria-hidden
                />
              );
            }
            const isActive = s.key === current?.key;
            return (
              <button
                key={s.key}
                onClick={() => {
                  playSound("tab");
                  setActive(s.key);
                }}
                className={`gamepadpagedsettings_PagedSettingsDialog_PageListItem_gh Focusable relative h-[42px] w-full shrink-0 cursor-pointer px-[31px] py-[10px] text-left ${
                  isActive
                    ? "gamepadpagedsettings_Active_gh text-bright"
                    : "text-body hover:text-bright"
                }`}
                style={
                  isActive
                    ? {
                        backgroundImage:
                          "linear-gradient(90deg, rgba(26,159,255,0.22) 0%, rgba(26,159,255,0) 100%)",
                      }
                    : undefined
                }
                data-active={isActive}
              >
                {/* no own color — inherits the button's, so themes recoloring
                    PageListItem land on the label too */}
                <span
                  className={`flex origin-left items-center text-[16px] transition-transform duration-150 ${
                    isActive ? "scale-110" : ""
                  }`}
                >
                  <span className="mr-4 flex h-5 w-5 items-center justify-center opacity-90">
                    {RAIL_ICONS[s.key] ?? s.icon}
                  </span>
                  {s.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Active page — own scroll pane on the measured #1a1c21 content
          backing (DialogContentTransition); rows are #23262e on top of it,
          the subtle lift that reads as "slightly see-through". Measured
          padding: 64px top (clears the header) / 37.76px sides / 62px bottom.
          Content scrolls faintly under the transparent header. */}
      <div className="gamepadpagedsettings_ContentTransition_gh gamepadpagedsettings_PagedSettingDialog_ContentColumn_gh h-full min-w-0 flex-1 overflow-y-auto scroll-pt-[72px] scroll-pb-[56px] bg-[#1a1c21] px-[37.76px] pb-[62px] pt-[64px]">
        <div className="h-9 text-[24px] font-bold leading-9 text-white">{current?.label}</div>
        <div className="flex flex-col gap-6">{current?.content}</div>
      </div>
    </div>
  );
}
