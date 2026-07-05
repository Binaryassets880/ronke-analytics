import type { WalletBadge } from "@/lib/queries";
import { badgeDef } from "@/config/badges";

/**
 * Earned-badge shelf on the wallet/profile page (U15). Groups badges by
 * category; each badge shows its tier (for tiered badges) and a tooltip
 * explaining how it was earned (the config description + the earning context),
 * so a holder understands why they hold a badge rather than just seeing it.
 */
const CATEGORY_ORDER = ["achievement", "bag_size", "collector", "holding_length"] as const;
const CATEGORY_LABEL: Record<string, string> = {
  achievement: "Achievements",
  bag_size: "Bag size",
  collector: "Collector",
  holding_length: "Holding length",
};

function tierLabel(badgeKey: string, tier: number | null): string | null {
  if (tier == null) return null;
  const def = badgeDef(badgeKey);
  return def?.tiers?.find((t) => t.tier === tier)?.label ?? null;
}

function earnedDetail(badge: WalletBadge): string {
  const ctx = badge.context ?? {};
  if (typeof ctx.tierLabel === "string") {
    if (typeof ctx.balance === "number") return `Balance ${Math.round(ctx.balance).toLocaleString()}`;
    if (typeof ctx.count === "number") return `${ctx.count} held`;
    if (typeof ctx.days === "number") return `${Math.floor(ctx.days)} days held`;
  }
  if (typeof ctx.lots === "number") return `${ctx.lots} acquisitions, never sold`;
  return "";
}

export function BadgeShelf({ badges }: { badges: WalletBadge[] }) {
  if (badges.length === 0) {
    return (
      <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
        <h2 className="mb-1 text-sm font-medium text-neutral-300">Badges</h2>
        <p className="text-sm text-neutral-500">No badges yet — hold, stack, and hodl to earn them.</p>
      </section>
    );
  }

  const byCategory = new Map<string, WalletBadge[]>();
  for (const b of badges) {
    const cat = badgeDef(b.badgeKey)?.category ?? "achievement";
    (byCategory.get(cat) ?? byCategory.set(cat, []).get(cat)!).push(b);
  }

  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
      <h2 className="mb-3 text-sm font-medium text-neutral-300">Badges</h2>
      <div className="space-y-4">
        {CATEGORY_ORDER.filter((c) => byCategory.has(c)).map((cat) => (
          <div key={cat}>
            <h3 className="mb-2 text-xs uppercase tracking-wide text-neutral-500">
              {CATEGORY_LABEL[cat]}
            </h3>
            <div className="flex flex-wrap gap-2">
              {byCategory.get(cat)!.map((b) => {
                const def = badgeDef(b.badgeKey);
                if (!def) return null;
                const tl = tierLabel(b.badgeKey, b.tier);
                const detail = earnedDetail(b);
                const tooltip = `${def.description}${detail ? ` — ${detail}` : ""}`;
                return (
                  <span
                    key={b.badgeKey}
                    title={tooltip}
                    className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-black/20 px-3 py-1 text-sm"
                  >
                    <span aria-hidden>{def.icon}</span>
                    <span>{tl ? `${def.label}: ${tl}` : def.label}</span>
                  </span>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
