import Image from "next/image";
import Link from "next/link";
import type { RarityRow, TraitDistribution, MetaState } from "@/lib/queries";
import { TraitFilter } from "./TraitFilter";
import { BarChart } from "./BarChart";
import { EmptyState } from "./States";

/**
 * Rarity leaderboard (U12): rank-sorted grid with NFT thumbnails, a single-trait
 * filter, and a trait-distribution chart. Standalone - NOT gated by the global
 * token/NFT asset toggle (rarity only applies to the collection).
 */
export function RarityView({
  rows,
  distributions,
  meta,
  filter,
  page = 0,
  pageSize = 60,
}: {
  rows: RarityRow[];
  distributions: TraitDistribution[];
  meta: MetaState;
  filter?: { traitType: string; value: string };
  page?: number;
  pageSize?: number;
}) {
  const filteredHref = (nextPage: number) => {
    const q = new URLSearchParams();
    if (filter) {
      q.set("tt", filter.traitType);
      q.set("tv", filter.value);
    }
    q.set("page", String(nextPage));
    return `/rarity?${q.toString()}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Ronkeverse · Rarity</h1>
        <TraitFilter distributions={distributions} active={filter} />
      </div>
      {meta.revealedSupply != null ? (
        <p className="text-sm text-neutral-400">
          Ranked by OpenRarity information content · {meta.revealedSupply} revealed tokens.
        </p>
      ) : null}

      {filter ? (
        <p className="text-sm text-neutral-300">
          Filtered to <span className="text-[var(--accent)]">{filter.traitType}: {filter.value}</span>{" "}
          — {rows.length} shown.{" "}
          <Link href="/rarity" className="text-[var(--accent)] hover:underline">
            clear
          </Link>
        </p>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState title="No ranked tokens yet." hint="Run fetch-traits to ingest metadata and compute rarity." />
      ) : (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          {rows.map((r) => (
            <Link
              key={r.tokenId}
              href={`/rarity/${r.tokenId}`}
              className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-2 text-center hover:border-[var(--accent)]"
            >
              {r.imageUrl ? (
                <Image
                  src={r.imageUrl}
                  alt={`Ronkeverse #${r.tokenId}`}
                  width={120}
                  height={120}
                  className="mx-auto aspect-square w-full rounded object-cover"
                  unoptimized
                />
              ) : (
                <div className="mx-auto flex aspect-square w-full items-center justify-center rounded bg-[var(--border)] text-xs text-neutral-500">
                  #{r.tokenId}
                </div>
              )}
              <div className="mt-1 text-xs text-neutral-400">#{r.tokenId}</div>
              <div className="text-xs font-medium text-[var(--accent)]">rank {r.rarityRank}</div>
            </Link>
          ))}
        </div>
      )}

      <div className="flex justify-between text-sm">
        {page > 0 ? (
          <Link href={filteredHref(page - 1)} className="text-[var(--accent)] hover:underline">
            ← Prev
          </Link>
        ) : (
          <span />
        )}
        {rows.length === pageSize ? (
          <Link href={filteredHref(page + 1)} className="text-[var(--accent)] hover:underline">
            Next →
          </Link>
        ) : (
          <span />
        )}
      </div>

      {distributions.length > 0 ? (
        <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
          <h2 className="mb-3 text-sm font-medium text-neutral-300">Trait distribution</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {distributions.map((d) => (
              <div key={d.traitType}>
                <h3 className="mb-1 text-xs uppercase tracking-wide text-neutral-500">{d.traitType}</h3>
                <BarChart
                  bars={d.values.slice(0, 8).map((v) => ({ label: v.value, count: v.count }))}
                  label={`${d.traitType} distribution`}
                />
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
