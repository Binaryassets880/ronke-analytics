import type { ReactNode } from "react";
import { BADGES, tierHint, badgeThresholdHint, type BadgeRealm } from "@/config/badges";

/**
 * The full badge catalog (E7) - every badge a wallet can earn, grouped by realm.
 * Shown on the landing so a newcomer sees there's a game to play by holding.
 * Unlike the per-wallet BadgeShelf, this is the whole set (nothing "earned").
 *
 * Every tier pill (Shrimp, Curator, ...) and every achievement badge with a
 * hidden number carries a hover tooltip that spells out the exact threshold.
 */
const REALM_ORDER: BadgeRealm[] = ["ronke", "ronkeverse", "both"];
const REALM_LABEL: Record<BadgeRealm, string> = {
  ronke: "$RONKE",
  ronkeverse: "Ronkeverse",
  both: "Ecosystem",
};

/** CSS-only hover tooltip (no client JS) with a native-title fallback. */
function Tip({ text, children }: { text: string; children: ReactNode }) {
  return (
    <span className="group/tip relative inline-flex" title={text}>
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-1.5 hidden w-max max-w-[220px] -translate-x-1/2 whitespace-normal rounded-md border border-[var(--border-strong)] bg-[var(--card-2)] px-2 py-1 text-xs font-normal leading-snug text-[var(--foreground)] shadow-lg group-hover/tip:block"
      >
        {text}
      </span>
    </span>
  );
}

export function BadgeCatalog() {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Badges to earn</h2>
        <p className="text-sm text-[var(--muted)]">
          Hold, stack, and hodl $RONKE and Ronkeverse to earn badges on your profile.
          Hover a tier to see exactly what earns it.
        </p>
      </div>
      {REALM_ORDER.map((realm) => {
        const badges = BADGES.filter((b) => b.realm === realm);
        if (badges.length === 0) return null;
        return (
          <div key={realm}>
            <h3 className="mb-2 text-xs uppercase tracking-wide text-[var(--muted-2)]">
              {REALM_LABEL[realm]}
            </h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {badges.map((b) => {
                const hint = badgeThresholdHint(b);
                return (
                  <div
                    key={b.key}
                    className="flex gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-3"
                  >
                    <span className="text-2xl" aria-hidden>
                      {b.icon}
                    </span>
                    <div className="min-w-0">
                      {/* Achievement badges: the label carries the exact-threshold tooltip. */}
                      {!b.tiers && hint ? (
                        <Tip text={hint}>
                          <span className="cursor-help font-medium underline decoration-dotted decoration-[var(--muted-3)] underline-offset-2">
                            {b.label}
                          </span>
                        </Tip>
                      ) : (
                        <div className="font-medium">{b.label}</div>
                      )}
                      <div className="text-sm text-[var(--muted)]">{b.description}</div>
                      {b.tiers ? (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {b.tiers.map((t) => (
                            <Tip key={t.tier} text={tierHint(b, t)}>
                              <span className="cursor-help rounded bg-[var(--card-2)] px-1.5 py-0.5 text-xs text-[var(--muted)] underline decoration-dotted decoration-[var(--muted-3)] underline-offset-2">
                                {t.label}
                              </span>
                            </Tip>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </section>
  );
}
