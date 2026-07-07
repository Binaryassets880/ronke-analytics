import type { ReactNode } from "react";

/**
 * CSS-only hover tooltip (no client JS) with a native-title fallback. Used to
 * explain jargon inline - metric labels, rarity scores, badge thresholds - so
 * the number is legible without leaving the page.
 *
 * `placement` flips the bubble below the anchor for elements near the top of the
 * viewport (e.g. the sticky header price pill) where an upward bubble would clip.
 */
export function Tip({
  text,
  children,
  placement = "top",
}: {
  text: string;
  children: ReactNode;
  placement?: "top" | "bottom";
}) {
  const pos = placement === "top" ? "bottom-full mb-1.5" : "top-full mt-1.5";
  return (
    <span className="group/tip relative inline-flex" title={text}>
      {children}
      <span
        role="tooltip"
        className={`pointer-events-none absolute ${pos} left-1/2 z-40 hidden w-max max-w-[240px] -translate-x-1/2 whitespace-normal rounded-md border border-[var(--border-strong)] bg-[var(--card-2)] px-2 py-1 text-xs font-normal leading-snug text-[var(--foreground)] shadow-lg group-hover/tip:block`}
      >
        {text}
      </span>
    </span>
  );
}

/** A small "i" affordance that reveals `text` on hover - pair with a label. */
export function InfoTip({ text, placement }: { text: string; placement?: "top" | "bottom" }) {
  return (
    <Tip text={text} placement={placement}>
      <span
        aria-hidden
        className="ml-1 inline-flex h-3.5 w-3.5 cursor-help items-center justify-center rounded-full border border-[var(--muted-3)] text-[9px] font-semibold leading-none text-[var(--muted-2)]"
      >
        i
      </span>
    </Tip>
  );
}
