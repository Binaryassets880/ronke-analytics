"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { DiamondBucket } from "@/config/contracts";
import type { TierDetail } from "@/lib/queries";

/**
 * Tier badge with the three numbers behind it on demand.
 *
 * The badge itself stays a single pill. Hovering it on a pointer device, or
 * tapping it on a touch device, opens the detail: how much of the sentence is
 * served, how far the rebuild has got, and the worst window the wallet ever
 * posted. All three are already on holder_metrics, so this costs one component
 * and no extra query.
 */

const TIERS: Record<DiamondBucket, { icon: string; label: string; color: string; blurb: string }> = {
  diamond: {
    icon: "\u{1F48E}",
    label: "Diamond",
    color: "var(--diamond)",
    blurb: "Never let go of a meaningful share of this position.",
  },
  regular: {
    icon: "\u{270B}",
    label: "Regular",
    color: "var(--regular)",
    blurb: "Has sold at some point, but is not dumping.",
  },
  paper: {
    icon: "\u{1F9FB}",
    label: "Paper",
    color: "var(--paper)",
    blurb: "Let go of half this position inside 30 days.",
  },
};

const pct = (n: number) => `${Math.round(n * 100)}%`;
const days = (n: number) => `${Math.max(0, Math.round(n))}`;

export function TierBadge({
  bucket,
  detail,
  unit = "units",
}: {
  bucket: DiamondBucket;
  detail?: TierDetail | null;
  /** What the rebuild numbers are counted in, e.g. "NFTs". */
  unit?: string;
}) {
  const t = TIERS[bucket];
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);
  const panelId = useId();

  // Tapping outside closes it on touch, where there is no pointer to leave.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!detail) {
    return (
      <span className="inline-flex items-center gap-1 text-sm font-medium" style={{ color: t.color }}>
        <span aria-hidden>{t.icon}</span>
        <span>{t.label}</span>
      </span>
    );
  }

  const serving = detail.sentenceRequiredDays > 0 && detail.sentenceServedDays < detail.sentenceRequiredDays;
  const rebuilding = detail.rebuildTarget > 0;
  const progress = rebuilding
    ? Math.min(1, detail.rebuildHeld / Math.max(1, detail.rebuildTarget))
    : 1;

  return (
    <span
      ref={wrap}
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        onFocus={() => setOpen(true)}
        className="inline-flex cursor-help items-center gap-1 rounded-md text-sm font-medium"
        style={{ color: t.color }}
      >
        <span aria-hidden>{t.icon}</span>
        <span>{t.label}</span>
      </button>

      {open ? (
        <span
          id={panelId}
          role="tooltip"
          className="rv-card absolute left-0 top-full z-20 mt-2 flex w-64 flex-col gap-2 p-3 text-left shadow-xl"
          style={{ background: "var(--card-2)" }}
        >
          <span className="text-xs" style={{ color: t.color }}>
            {t.blurb}
          </span>

          {serving ? (
            <span className="flex justify-between gap-3 text-xs text-[var(--muted)]">
              <span>Days clean</span>
              <span className="mono text-[var(--foreground)]">
                {days(detail.sentenceServedDays)} of {days(detail.sentenceRequiredDays)}
              </span>
            </span>
          ) : null}

          {rebuilding ? (
            <span className="flex flex-col gap-1">
              <span className="flex justify-between gap-3 text-xs text-[var(--muted)]">
                <span>Holding</span>
                <span className="mono text-[var(--foreground)]">
                  {Math.round(detail.rebuildHeld).toLocaleString()} of{" "}
                  {Math.round(detail.rebuildTarget).toLocaleString()} {unit}
                </span>
              </span>
              <span className="h-1.5 overflow-hidden rounded-full bg-[var(--card)]">
                <span
                  className="block h-full rounded-full"
                  style={{ width: `${Math.round(progress * 100)}%`, background: t.color }}
                />
              </span>
            </span>
          ) : null}

          <span className="flex justify-between gap-3 text-xs text-[var(--muted)]">
            <span>Worst 30 days</span>
            <span className="mono text-[var(--foreground)]">
              {detail.peakSellRate > 0 ? `let go of ${pct(detail.peakSellRate)}` : "never sold"}
            </span>
          </span>

          {detail.episodeCount > 0 ? (
            <span className="flex justify-between gap-3 text-xs text-[var(--muted)]">
              <span>Dumps on record</span>
              <span className="mono text-[var(--foreground)]">{detail.episodeCount}</span>
            </span>
          ) : null}
        </span>
      ) : null}
    </span>
  );
}
