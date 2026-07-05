import type { DiamondBucket } from "@/config/contracts";

/**
 * Diamond-bucket indicator. Uses an icon + text label (never color alone) so
 * the bucket is legible without color perception (accessibility, per U7).
 */
const BUCKETS: Record<DiamondBucket, { icon: string; label: string; cls: string }> = {
  diamond: { icon: "\u{1F48E}", label: "Diamond", cls: "text-sky-300" },
  regular: { icon: "\u{270B}", label: "Regular", cls: "text-emerald-300" },
  paper: { icon: "\u{1F9FB}", label: "Paper", cls: "text-rose-300" },
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
      className={`inline-flex items-center gap-1 text-sm font-medium ${b.cls}`}
      title={title}
    >
      <span aria-hidden>{b.icon}</span>
      <span>{b.label}</span>
    </span>
  );
}
