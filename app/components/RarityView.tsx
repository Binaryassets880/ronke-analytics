import Image from "next/image";
import Link from "next/link";
import type { RarityRow, TraitDistribution, MetaState, OneOfOneToken, OneOfOneCounts } from "@/lib/queries";
import { TraitFilter } from "./TraitFilter";
import { BarChart } from "./BarChart";
import { EmptyState } from "./States";

/** Which slice of the collection the page is showing. */
export type RarityViewMode = "all" | "community" | "official" | "standard";

/** How many 1/1s to preview in the "all" view before "View all →". */
const PREVIEW_CAP = 12;

/** A single NFT thumbnail card, reused by every grid. */
function TokenCard({
  tokenId,
  imageUrl,
  name,
  caption,
}: {
  tokenId: string;
  imageUrl: string | null;
  name?: string | null;
  caption: string;
}) {
  return (
    <Link
      href={`/rarity/${tokenId}`}
      className="rounded-lg border border-[var(--border)] bg-[var(--card-2)] p-2 text-center transition-colors hover:border-[var(--accent)]"
    >
      {imageUrl ? (
        <Image
          src={imageUrl}
          alt={name ?? `Ronkeverse #${tokenId}`}
          width={120}
          height={120}
          className="mx-auto aspect-square w-full rounded object-cover"
          unoptimized
        />
      ) : (
        <div className="mx-auto flex aspect-square w-full items-center justify-center rounded bg-[var(--border)] text-xs text-[var(--muted-2)]">
          #{tokenId}
        </div>
      )}
      {name ? (
        <div className="mt-1 truncate text-xs font-medium text-[var(--accent)]" title={name}>
          {name}
        </div>
      ) : null}
      <div className="mt-1 text-xs text-[var(--muted)]">#{tokenId}</div>
      <div className="text-xs font-medium text-[var(--accent)]">{caption}</div>
    </Link>
  );
}

/**
 * A 1/1 showcase bucket. In the "all" view it is capped to a preview with a
 * "View all →" link into its own tab; in its own tab it renders in full.
 */
function OneOfOneBucket({
  title,
  emoji,
  blurb,
  tokens,
  total,
  cap,
  viewAllHref,
}: {
  title: string;
  emoji: string;
  blurb: string;
  tokens: OneOfOneToken[];
  total: number;
  cap?: number;
  viewAllHref?: string;
}) {
  if (total === 0) return null;
  const shown = cap != null ? tokens.slice(0, cap) : tokens;
  const hasMore = cap != null && total > shown.length;
  return (
    <section className="rounded-xl border border-[var(--accent)]/40 bg-[var(--card)] p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">
          {emoji} {title} <span className="text-[var(--muted-2)]">· {total}</span>
        </h2>
        <p className="text-xs text-[var(--muted)]">{blurb}</p>
      </div>
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
        {shown.map((t) => (
          <TokenCard key={t.tokenId} tokenId={t.tokenId} imageUrl={t.imageUrl} name={t.name} caption="1 / 1" />
        ))}
      </div>
      {hasMore && viewAllHref ? (
        <div className="mt-3 text-right">
          <Link href={viewAllHref} className="text-xs font-medium text-[var(--accent)] hover:underline">
            View all {total} {title} →
          </Link>
        </div>
      ) : null}
    </section>
  );
}

/** The segmented control that switches between collection slices. */
function ViewTabs({
  active,
  counts,
  standardCount,
}: {
  active: RarityViewMode;
  counts: OneOfOneCounts;
  standardCount: number | null;
}) {
  const tabs: { view: RarityViewMode; label: string; count: number | null }[] = [
    { view: "all", label: "All", count: null },
    ...(counts.community > 0
      ? [{ view: "community" as RarityViewMode, label: "Community 1/1", count: counts.community }]
      : []),
    ...(counts.official > 0
      ? [{ view: "official" as RarityViewMode, label: "Official 1/1", count: counts.official }]
      : []),
    { view: "standard", label: "Standard", count: standardCount },
  ];
  return (
    <nav aria-label="Rarity views" className="flex flex-wrap gap-2">
      {tabs.map((t) => {
        const isActive = t.view === active;
        return (
          <Link
            key={t.view}
            href={t.view === "all" ? "/rarity" : `/rarity?view=${t.view}`}
            aria-current={isActive ? "page" : undefined}
            className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
              isActive
                ? "border-[var(--accent)] bg-[var(--accent)]/10 font-semibold text-[var(--accent)]"
                : "border-[var(--border)] bg-[var(--card)] text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--foreground)]"
            }`}
          >
            {t.label}
            {t.count != null ? (
              <span className="ml-1.5 text-xs text-[var(--muted-2)]">{t.count.toLocaleString()}</span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Rarity leaderboard (U12): a segmented view over the collection - All (capped
 * 1/1 previews + the standard ranked grid), each 1/1 bucket in full, or the
 * standard 1..N ladder on its own. The 1/1 pieces (community + official) are
 * always kept out of the standard rank ladder. Standalone - NOT gated by the
 * global asset toggle.
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
  view = "all",
  counts = { community: 0, official: 0 },
}: {
  rows: RarityRow[];
  distributions: TraitDistribution[];
  meta: MetaState;
  filter?: { traitType: string; value: string };
  page?: number;
  pageSize?: number;
  communityOneOfOnes?: OneOfOneToken[];
  officialOneOfOnes?: OneOfOneToken[];
  view?: RarityViewMode;
  counts?: OneOfOneCounts;
}) {
  // A trait filter only applies to the standard ladder, so it forces the standard slice.
  const activeView: RarityViewMode = filter ? "standard" : view;
  // The standard ladder is the revealed collection minus the 1/1s (which are
  // null-ranked and live in their own tabs), so the tab count matches the grid.
  const standardCount =
    meta.revealedSupply != null
      ? Math.max(0, meta.revealedSupply - counts.community - counts.official)
      : null;
  const showStandard = activeView === "all" || activeView === "standard";
  const showCommunity = activeView === "all" || activeView === "community";
  const showOfficial = activeView === "all" || activeView === "official";

  const filteredHref = (nextPage: number) => {
    const q = new URLSearchParams();
    if (filter) {
      q.set("tt", filter.traitType);
      q.set("tv", filter.value);
    } else if (view !== "all") {
      q.set("view", view);
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

      <ViewTabs active={activeView} counts={counts} standardCount={standardCount} />

      {filter ? (
        <p className="text-sm text-[var(--muted)]">
          Filtered to <span className="text-[var(--accent)]">{filter.traitType}: {filter.value}</span>{" "}
          — {rows.length} shown.{" "}
          <Link href="/rarity" className="text-[var(--accent)] hover:underline">
            clear
          </Link>
        </p>
      ) : null}

      {showCommunity ? (
        <OneOfOneBucket
          title="Community 1/1s"
          emoji="🎨"
          blurb="Hand-made community pieces — each unique, outside the standard ranking."
          tokens={communityOneOfOnes}
          total={counts.community}
          cap={activeView === "all" ? PREVIEW_CAP : undefined}
          viewAllHref="/rarity?view=community"
        />
      ) : null}

      {showOfficial ? (
        <OneOfOneBucket
          title="Official 1/1s"
          emoji="⭐"
          blurb="Team-made one-of-ones."
          tokens={officialOneOfOnes}
          total={counts.official}
          cap={activeView === "all" ? PREVIEW_CAP : undefined}
          viewAllHref="/rarity?view=official"
        />
      ) : null}

      {showStandard ? (
        <>
          {meta.revealedSupply != null && !filter ? (
            <div className="flex flex-wrap items-baseline justify-between gap-2 pt-1">
              <h2 className="text-sm font-semibold text-[var(--muted)]">Standard collection · ranked</h2>
              <p className="text-xs text-[var(--muted)]">
                Standard collection ranked by OpenRarity information content. One-of-ones are showcased in
                their own tabs.
              </p>
            </div>
          ) : null}

          {rows.length === 0 ? (
            <EmptyState title="No ranked tokens yet." hint="Run fetch-traits to ingest metadata and compute rarity." />
          ) : (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
              {rows.map((r) => (
                <TokenCard key={r.tokenId} tokenId={r.tokenId} imageUrl={r.imageUrl} caption={`rank ${r.rarityRank}`} />
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
        </>
      ) : null}

      {distributions.length > 0 && showStandard ? (
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
