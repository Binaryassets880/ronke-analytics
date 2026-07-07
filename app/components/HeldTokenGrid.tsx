"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import type { WalletHeldToken } from "@/lib/queries";

/**
 * Paginated grid of the Ronkeverse tokens a wallet holds. The wallet query
 * returns the full set; we page through it client-side (no round-trips) so a
 * big collector's entire holdings are browsable instead of capped at 24.
 */
const PAGE_SIZE = 24;

export function HeldTokenGrid({ tokens }: { tokens: WalletHeldToken[] }) {
  const [page, setPage] = useState(0);
  const pages = Math.ceil(tokens.length / PAGE_SIZE);
  const start = page * PAGE_SIZE;
  const shown = tokens.slice(start, start + PAGE_SIZE);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
        {shown.map((t) => (
          <Link
            key={t.tokenId}
            href={`/rarity/${t.tokenId}`}
            className="group rounded-lg border border-[var(--border)] p-2 text-center transition-colors hover:border-[var(--accent)]"
          >
            {t.imageUrl ? (
              <Image
                src={t.imageUrl}
                alt={`Ronkeverse #${t.tokenId}`}
                width={96}
                height={96}
                className="mx-auto aspect-square w-full rounded object-cover"
                unoptimized
              />
            ) : (
              <div className="mx-auto flex aspect-square w-full items-center justify-center rounded bg-[var(--border)] text-xs text-[var(--muted-2)]">
                #{t.tokenId}
              </div>
            )}
            <div className="mt-1 text-xs text-[var(--muted)]">#{t.tokenId}</div>
            {t.tier === "community_1of1" ? (
              <div className="text-xs font-medium text-[var(--accent-soft)]">★ Community 1/1</div>
            ) : t.tier === "official_1of1" ? (
              <div className="text-xs font-medium text-[var(--accent-soft)]">★ Official 1/1</div>
            ) : t.rarityRank ? (
              <div className="text-xs text-[var(--accent)]">rank {t.rarityRank}</div>
            ) : null}
          </Link>
        ))}
      </div>

      {pages > 1 ? (
        <div className="flex items-center justify-between text-sm">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="rounded-lg border border-[var(--border)] px-3 py-1 transition-colors enabled:hover:border-[var(--accent)] disabled:opacity-40"
          >
            ← Prev
          </button>
          <span className="mono text-xs text-[var(--muted-2)]">
            {start + 1}–{Math.min(start + PAGE_SIZE, tokens.length)} of {tokens.length}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(pages - 1, p + 1))}
            disabled={page >= pages - 1}
            className="rounded-lg border border-[var(--border)] px-3 py-1 transition-colors enabled:hover:border-[var(--accent)] disabled:opacity-40"
          >
            Next →
          </button>
        </div>
      ) : null}
    </div>
  );
}
