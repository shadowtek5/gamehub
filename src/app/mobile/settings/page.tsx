import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth";
import { SETTINGS_ICONS } from "@/components/settingsIcons";
import { getMobileSettingsSections } from "./sections";

export const dynamic = "force-dynamic";

export default async function MobileSettingsPage() {
  const t = await getTranslations("mobileSettings");
  const user = await requireUser();
  if (!user.isAdmin) redirect("/mobile");
  const sections = await getMobileSettingsSections(user);

  return (
    <div>
      <h1 className="mb-4 mt-1 text-[22px] font-black text-bright">{t("list.title")}</h1>
      <div className="overflow-hidden rounded-[12px] bg-[#1a1f27] ring-1 ring-white/5">
        {sections.map((s, i) => (
          <Link
            key={s.key}
            href={`/mobile/settings/${s.key}`}
            className={`flex items-center gap-3 px-4 py-3.5 active:bg-white/5 ${
              i > 0 ? "border-t border-white/5" : ""
            }`}
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] bg-[#12161c] text-white/90">
              {SETTINGS_ICONS[s.key] ?? <span className="text-[16px]">{s.icon}</span>}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold text-bright">{s.label}</span>
              <span className="block truncate text-[12px] text-dim">{s.blurb}</span>
            </span>
            <span className="text-dim">›</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
