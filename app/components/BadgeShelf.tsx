import type { WalletBadge } from "@/lib/queries";
import { badgeDef, tierHint, badgeThresholdHint, type BadgeDef, type BadgeRealm } from "@/config/badges";

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

/**
 * Tooltip = the badge's exact threshold + what this wallet actually has, so a
 * visitor learns what earns the badge without hunting down the badge catalog.
 * e.g. "Hold at least 1,000,000 $RONKE — this wallet holds 3,000,000."
 */
function tooltipFor(badge: WalletBadge, def: BadgeDef): string {
  const ctx = badge.context ?? {};
  const tier = def.tiers?.find((t) => t.tier === badge.tier);
  if (tier) {
    const requirement = tierHint(def, tier);
    let actual = "";
    if (typeof ctx.balance === "number")
      actual = `this wallet holds ${Math.round(ctx.balance).toLocaleString()}`;
    else if (typeof ctx.count === "number")
      actual = `this wallet holds ${ctx.count}`;
    else if (typeof ctx.days === "number")
      actual = `this wallet is at ${Math.floor(ctx.days).toLocaleString()} days`;
    return actual ? `${requirement} — ${actual}.` : `${requirement}.`;
  }
  const requirement = badgeThresholdHint(def) ?? def.description;
  const extra = typeof ctx.lots === "number" ? ` — ${ctx.lots} buys, never sold.` : "";
  return `${requirement}${extra}`;
}

export function BadgeShelf({ badges }: { badges: WalletBadge[] }) {
  if (badges.length === 0) {
    return (
      <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
        <h2 className="mb-1 text-sm font-medium text-[var(--muted)]">Badges</h2>
        <p className="text-sm text-[var(--muted-2)]">No badges yet — hold, stack, and hodl to earn them.</p>
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
      <h2 className="mb-3 text-sm font-medium text-[var(--muted)]">Badges</h2>
      <div className="space-y-4">
        {REALM_ORDER.filter((r) => byRealm.has(r)).map((realm) => (
          <div key={realm}>
            <h3 className="mb-2 text-xs uppercase tracking-wide text-[var(--muted-2)]">
              {REALM_LABEL[realm]}
            </h3>
            <div className="flex flex-wrap gap-2">
              {byRealm.get(realm)!.map((b) => {
                const def = badgeDef(b.badgeKey);
                if (!def) return null;
                const tl = tierLabel(b.badgeKey, b.tier);
                const tooltip = tooltipFor(b, def);
                return (
                  <span
                    key={b.badgeKey}
                    title={tooltip}
                    className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--card-2)] px-3 py-1 text-sm"
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
