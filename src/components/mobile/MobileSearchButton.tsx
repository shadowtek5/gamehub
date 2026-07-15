"use client";

// Opens the universal search palette (CommandPalette) from the mobile top bar.
export default function MobileSearchButton({ label }: { label: string }) {
  return (
    <button
      onClick={() => window.dispatchEvent(new Event("gh-search"))}
      aria-label={label}
      className="flex h-10 w-10 items-center justify-center rounded-full text-dim active:bg-white/10"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-5 w-5">
        <circle cx="10.5" cy="10.5" r="6.5" />
        <line x1="15.5" y1="15.5" x2="21" y2="21" />
      </svg>
    </button>
  );
}
