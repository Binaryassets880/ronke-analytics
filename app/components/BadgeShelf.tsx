import type { WalletBadge } from "@/lib/queries";
import { badgeDef, type BadgeRealm } from "@/config/badges";

/**
 * Earned-badge shelf on the wallet/profile page (U15, regrouped in E5a).
 *
 * Badges are grouped by ecosystem realm first - $RONKE, Ronkeverse, Ecosystem -
 * so a visitor can immediately see which token or NFT each badge belongs to.
 * Each badge shows its tier (for tiered badges) and a tooltip explaining how it
 * was earned. (E5b will later split the currently cross-asset "Ecosystem" badges
 * into per-asset variants so each realm is behaviorally exact.)
 */
const REALM_ORDER: BadgeRealm[] = ["ronke", "ronkeverse", "both"];
const REALM_LABEL: Record<BadgeRealm, string> = {
  ronke: "$RONKE",
  ronkeverse: "Ronkeverse",
  both: "Ecosystem",
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

  const byRealm = new Map<BadgeRealm, WalletBadge[]>();
  for (const b of badges) {
    const realm = badgeDef(b.badgeKey)?.realm ?? "both";
    (byRealm.get(realm) ?? byRealm.set(realm, []).get(realm)!).push(b);
  }

  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
      <h2 className="mb-3 text-sm font-medium text-neutral-300">Badges</h2>
      <div className="space-y-4">
        {REALM_ORDER.filter((r) => byRealm.has(r)).map((realm) => (
          <div key={realm}>
            <h3 className="mb-2 text-xs uppercase tracking-wide text-neutral-500">
              {REALM_LABEL[realm]}
            </h3>
            <div className="flex flex-wrap gap-2">
              {byRealm.get(realm)!.map((b) => {
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
