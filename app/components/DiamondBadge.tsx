import type { DiamondBucket } from "@/config/contracts";

/**
 * Diamond-bucket indicator. Uses an icon + text label (never color alone) so
 * the bucket is legible without color perception (accessibility, per U7).
 */
// Colors map to the brand tokens (diamond=green, regular=blue, paper=orange),
// matching the palette used everywhere else - so the badge reinforces the
// distribution charts instead of contradicting them.
const BUCKETS: Record<DiamondBucket, { icon: string; label: string; color: string }> = {
  diamond: { icon: "\u{1F48E}", label: "Diamond", color: "var(--diamond)" },
  regular: { icon: "\u{270B}", label: "Regular", color: "var(--regular)" },
  paper: { icon: "\u{1F9FB}", label: "Paper", color: "var(--paper)" },
};

export function DiamondBadge({
  bucket,
  title,
}: {
  bucket: DiamondBucket;
  title?: string;
}) {
  const b = BUCKETS[bucket];
  return (
    <span
      className="inline-flex items-center gap-1 text-sm font-medium"
      style={{ color: b.color }}
      title={title}
    >
      <span aria-hidden>{b.icon}</span>
      <span>{b.label}</span>
    </span>
  );
}
