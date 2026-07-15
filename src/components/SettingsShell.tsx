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
import { SETTINGS_ICONS } from "./settingsIcons";

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
                    {SETTINGS_ICONS[s.key] ?? s.icon}
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
