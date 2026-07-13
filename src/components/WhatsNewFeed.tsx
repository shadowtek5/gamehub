// The full GameHub changelog, as a date-grouped feed of event cards. Backs both
// the desktop /whats-new page and the mobile /mobile/whats-new page — the pages
// own their header chrome; this owns the release-notes cards. Newest first, one
// dated group per calendar day. Each card is banner-on-top / text-below (the
// home What's New card shape) so the banner shows at its exact 600×264 ratio and
// never crops or floats in an oversized panel.

import { getTranslations } from "next-intl/server";
import type { NewsItem } from "@/lib/news/types";

function groupByDate(items: NewsItem[]): { date: string; items: NewsItem[] }[] {
  const groups: { date: string; items: NewsItem[] }[] = [];
  for (const item of items) {
    const date = item.date.slice(0, 10);
    const bucket = groups.find((g) => g.date === date);
    if (bucket) bucket.items.push(item);
    else groups.push({ date, items: [item] });
  }
  return groups;
}

function prettyDate(iso: string): string {
  // iso is YYYY-MM-DD; format without Date parsing surprises (UTC noon anchor)
  const d = new Date(`${iso}T12:00:00.000Z`);
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

export default async function WhatsNewFeed({ items }: { items: NewsItem[] }) {
  const t = await getTranslations("activityComps.whatsNew");
  if (items.length === 0) {
    return <p className="py-16 text-center text-sm text-dim">{t("nothingNew")}</p>;
  }
  const groups = groupByDate(items);
  return (
    <div className="flex flex-col gap-8">
      {groups.map((group) => (
        <section key={group.date}>
          <div className="appactivityday_AppActivityDate_gh mb-4 border-b border-white/10 pb-1.5 text-[13px] font-semibold uppercase tracking-[0.15em] text-dim">
            {prettyDate(group.date)}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {group.items.map((item) => {
              const accent = item.accent ?? "#1a9fff";
              return (
                <article
                  key={item.id}
                  className="gamepadhomewhatsnew_EventPreviewContainer_gh flex flex-col overflow-hidden rounded-[6px] bg-white/[0.05] ring-1 ring-white/5"
                >
                  {/* banner: full card width at the native 600×264 ratio, so
                      object-cover fills it exactly with nothing cropped */}
                  <div className="relative aspect-[600/264] w-full overflow-hidden bg-[linear-gradient(150deg,#141b24,#0b0f14)]">
                    {item.image && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.image}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    )}
                    {item.overlay && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.overlay}
                        alt=""
                        loading="lazy"
                        className="pointer-events-none absolute inset-0 m-auto max-h-[62%] max-w-[58%] object-contain [filter:drop-shadow(0_2px_10px_rgba(0,0,0,0.6))]"
                      />
                    )}
                  </div>
                  <div className="flex flex-1 flex-col p-4">
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.5px] text-dim">
                      <span
                        className="inline-block h-2 w-2 rounded-full"
                        style={{ background: accent }}
                      />
                      <span>{item.category}</span>
                    </div>
                    <h2 className="mt-1.5 text-[18px] font-bold leading-[24px] text-bright">
                      {item.title}
                    </h2>
                    {item.body && (
                      <p className="mt-2 text-[13px] leading-[19px] text-body/85">{item.body}</p>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
