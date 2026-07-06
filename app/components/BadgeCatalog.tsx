import { BADGES, type BadgeRealm } from "@/config/badges";

/**
 * The full badge catalog (E7) - every badge a wallet can earn, grouped by realm.
 * Shown on the landing so a newcomer sees there's a game to play by holding.
 * Unlike the per-wallet BadgeShelf, this is the whole set (nothing "earned").
 */
const REALM_ORDER: BadgeRealm[] = ["ronke", "ronkeverse", "both"];
const REALM_LABEL: Record<BadgeRealm, string> = {
  ronke: "$RONKE",
  ronkeverse: "Ronkeverse",
  both: "Ecosystem",
};

export function BadgeCatalog() {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Badges to earn</h2>
        <p className="text-sm text-neutral-400">
          Hold, stack, and hodl $RONKE and Ronkeverse to earn badges on your profile.
        </p>
      </div>
      {REALM_ORDER.map((realm) => {
        const badges = BADGES.filter((b) => b.realm === realm);
        if (badges.length === 0) return null;
        return (
          <div key={realm}>
            <h3 className="mb-2 text-xs uppercase tracking-wide text-neutral-500">
              {REALM_LABEL[realm]}
            </h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {badges.map((b) => (
                <div
                  key={b.key}
                  className="flex gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-3"
                >
                  <span className="text-2xl" aria-hidden>
                    {b.icon}
                  </span>
                  <div className="min-w-0">
                    <div className="font-medium">{b.label}</div>
                    <div className="text-sm text-neutral-400">{b.description}</div>
                    {b.tiers ? (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {b.tiers.map((t) => (
                          <span
                            key={t.tier}
                            className="rounded bg-black/30 px-1.5 py-0.5 text-xs text-neutral-400"
                          >
                            {t.label}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
}
