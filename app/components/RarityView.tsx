import Image from "next/image";
import Link from "next/link";
import type { RarityRow, TraitDistribution, MetaState, OneOfOneToken } from "@/lib/queries";
import { TraitFilter } from "./TraitFilter";
import { BarChart } from "./BarChart";
import { EmptyState } from "./States";

/** A 1/1 showcase bucket rendered above the standard ranked grid. */
function OneOfOneBucket({
  title,
  emoji,
  blurb,
  tokens,
}: {
  title: string;
  emoji: string;
  blurb: string;
  tokens: OneOfOneToken[];
}) {
  if (tokens.length === 0) return null;
  return (
    <section className="rounded-xl border border-[var(--accent)]/40 bg-[var(--card)] p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">
          {emoji} {title} <span className="text-[var(--muted-2)]">· {tokens.length}</span>
        </h2>
        <p className="text-xs text-[var(--muted)]">{blurb}</p>
      </div>
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
        {tokens.map((t) => (
          <Link
            key={t.tokenId}
            href={`/rarity/${t.tokenId}`}
            className="rounded-lg border border-[var(--border)] bg-[var(--card-2)] p-2 text-center transition-colors hover:border-[var(--accent)]"
          >
            {t.imageUrl ? (
              <Image
                src={t.imageUrl}
                alt={t.name ?? `Ronkeverse #${t.tokenId}`}
                width={120}
                height={120}
                className="mx-auto aspect-square w-full rounded object-cover"
                unoptimized
              />
            ) : (
              <div className="mx-auto flex aspect-square w-full items-center justify-center rounded bg-[var(--border)] text-xs text-[var(--muted-2)]">
                #{t.tokenId}
              </div>
            )}
            <div className="mt-1 truncate text-xs font-medium text-[var(--accent)]" title={t.name ?? undefined}>
              {t.name ?? `#${t.tokenId}`}
            </div>
            <div className="text-xs text-[var(--muted-2)]">#{t.tokenId}</div>
          </Link>
        ))}
      </div>
    </section>
  );
}

/**
 * Rarity leaderboard (U12): rank-sorted grid with NFT thumbnails, a single-trait
 * filter, and a trait-distribution chart. The 1/1 pieces (community + official)
 * are showcased in their own buckets above the standard 1..N ladder rather than
 * being ranked as near-common. Standalone - NOT gated by the global asset toggle.
 */
export function RarityView({
  rows,
  distributions,
  meta,
  filter,
  page = 0,
  pageSize = 60,
  communityOneOfOnes = [],
  officialOneOfOnes = [],
}: {
  rows: RarityRow[];
  distributions: TraitDistribution[];
  meta: MetaState;
  filter?: { traitType: string; value: string };
  page?: number;
  pageSize?: number;
  communityOneOfOnes?: OneOfOneToken[];
  officialOneOfOnes?: OneOfOneToken[];
}) {
  // Buckets only make sense on the unfiltered first page (the showcase header).
  const showBuckets = !filter && page === 0;
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
        <p className="text-sm text-[var(--muted)]">
          Standard collection ranked by OpenRarity information content. One-of-ones are
          showcased in their own buckets below.
        </p>
      ) : null}

      {showBuckets ? (
        <>
          <OneOfOneBucket
            title="Community 1/1s"
            emoji="🎨"
            blurb="Hand-made community pieces — each unique, outside the standard ranking."
            tokens={communityOneOfOnes}
          />
          <OneOfOneBucket
            title="Official 1/1s"
            emoji="⭐"
            blurb="Team-made one-of-ones."
            tokens={officialOneOfOnes}
          />
          {(communityOneOfOnes.length > 0 || officialOneOfOnes.length > 0) ? (
            <h2 className="pt-2 text-sm font-semibold text-[var(--muted)]">Standard collection · ranked</h2>
          ) : null}
        </>
      ) : null}

      {filter ? (
        <p className="text-sm text-[var(--muted)]">
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
              className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-2 text-center transition-colors hover:border-[var(--accent)]"
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
                <div className="mx-auto flex aspect-square w-full items-center justify-center rounded bg-[var(--border)] text-xs text-[var(--muted-2)]">
                  #{r.tokenId}
                </div>
              )}
              <div className="mt-1 text-xs text-[var(--muted)]">#{r.tokenId}</div>
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
          <h2 className="mb-3 text-sm font-medium text-[var(--muted)]">Trait distribution</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {distributions.map((d) => (
              <div key={d.traitType}>
                <h3 className="mb-1 text-xs uppercase tracking-wide text-[var(--muted-2)]">{d.traitType}</h3>
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
