import { RonkeMark } from "./RonkeMark";

/** Shared footer across every view. */
export function SiteFooter() {
  return (
    <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 border-t border-[var(--border-soft)] px-4 py-8 sm:px-6">
      <RonkeMark size="sm" />
      <div className="mono text-right text-[13px] text-[var(--muted-3)]">
        Analytics for $RONKE &amp; Ronkeverse · on Ronin · not financial advice
      </div>
    </footer>
  );
}
