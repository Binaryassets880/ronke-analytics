import Image from "next/image";
import type { TokenDetail } from "@/lib/queries";
import { StatTile } from "./StatTile";
import { formatPct } from "@/lib/format";

/**
 * Per-token rarity detail (U12): image, OpenRarity rank + score, and each trait
 * with its probability + a rarity label. An unrevealed token (no rank) renders
 * an explicit unrevealed state rather than a bogus rank.
 */
export function TokenDetailView({ token }: { token: TokenDetail }) {
  const isOneOfOne = token.tier !== "standard";
  // Only a standard token with no rank is genuinely unrevealed; 1/1s are ranked
  // in their own bucket, not on the standard ladder.
  const unrevealed = token.rarityRank == null && !isOneOfOne;
  const oneOfOneLabel = token.tier === "community_1of1" ? "Community 1/1" : "Official 1/1";
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Ronkeverse #{token.tokenId}</h1>

      <div className="grid gap-6 sm:grid-cols-[240px_1fr]">
        <div>
          {token.imageUrl ? (
            <Image
              src={token.imageUrl}
              alt={`Ronkeverse #${token.tokenId}`}
              width={240}
              height={240}
              className="w-full rounded-xl border border-[var(--border)] object-cover"
              unoptimized
            />
          ) : (
            <div className="flex aspect-square w-full items-center justify-center rounded-xl bg-[var(--border)] text-neutral-500">
              #{token.tokenId}
            </div>
          )}
        </div>

        <div className="space-y-4">
          {unrevealed ? (
            <div className="rounded-xl border border-amber-500/30 bg-[var(--card)] p-4 text-amber-200">
              This token is unrevealed — no traits are indexed yet, so it has no rarity rank.
            </div>
          ) : isOneOfOne ? (
            <div className="grid grid-cols-2 gap-3">
              <StatTile label="Rarity tier" value={oneOfOneLabel} />
              <StatTile label="Info-content score" value={token.infoContentScore.toFixed(3)} />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <StatTile label="OpenRarity rank" value={`#${token.rarityRank}`} />
              <StatTile label="Info-content score" value={token.infoContentScore.toFixed(3)} />
            </div>
          )}

          {token.traits.length > 0 ? (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
              <h2 className="mb-2 text-sm font-medium text-neutral-300">Traits</h2>
              <ul className="divide-y divide-[var(--border)]/60">
                {token.traits.map((t) => (
                  <li key={`${t.traitType}-${t.value}`} className="flex items-center justify-between py-2 text-sm">
                    <span className="text-neutral-400">{t.traitType}</span>
                    <span className="flex items-center gap-2">
                      <span>{t.value}</span>
                      <span className="text-xs text-[var(--accent)]">{formatPct(t.probability)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
