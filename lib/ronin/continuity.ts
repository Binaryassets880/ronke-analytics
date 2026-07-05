/**
 * Migration continuity assertion (KTD-4).
 *
 * Before a full backfill, confirm the chosen source returns BOTH a known
 * pre-migration transfer (block < MIGRATION_BLOCK) and a known post-migration
 * transfer (block >= MIGRATION_BLOCK). If the pre-migration one is missing, the
 * source does not index pre-L2 sidechain history and diamond-hands would be
 * wrong - so we RAISE rather than silently proceed, forcing the Blockscout
 * legacy-era path.
 *
 * Per the U13 spike, Moralis DOES index pre-L2 history, so this is expected to
 * pass; it is a defensive check, not a branch we expect to take.
 */

import type { NormalizedTransfer } from "@/lib/types";
import type { Asset } from "@/config/contracts";
import { MIGRATION_BLOCK } from "@/config/contracts";
import type { RoninDataClient } from "./client";

export interface KnownTransfer {
  txHash: string;
  blockNumber: number;
}

export class ContinuityError extends Error {}

/**
 * Assert continuity for an asset by scanning a small window around each known
 * transfer. Throws ContinuityError if either side is not returned by `client`.
 */
export async function assertContinuity(
  client: RoninDataClient,
  asset: Asset,
  known: { pre: KnownTransfer; post: KnownTransfer },
): Promise<{ preFound: boolean; postFound: boolean }> {
  if (known.pre.blockNumber >= MIGRATION_BLOCK) {
    throw new ContinuityError(
      `pre-migration fixture block ${known.pre.blockNumber} is not < MIGRATION_BLOCK (${MIGRATION_BLOCK})`,
    );
  }
  if (known.post.blockNumber < MIGRATION_BLOCK) {
    throw new ContinuityError(
      `post-migration fixture block ${known.post.blockNumber} is not >= MIGRATION_BLOCK (${MIGRATION_BLOCK})`,
    );
  }

  const preFound = await scanFor(client, asset, known.pre);
  const postFound = await scanFor(client, asset, known.post);

  if (!preFound) {
    throw new ContinuityError(
      `Continuity FAILED for ${asset}: pre-migration transfer ${known.pre.txHash} ` +
        `(block ${known.pre.blockNumber}) not returned by the source. Pre-L2 history ` +
        `appears missing - the Blockscout legacy-era path is required.`,
    );
  }
  if (!postFound) {
    throw new ContinuityError(
      `Continuity FAILED for ${asset}: post-migration transfer ${known.post.txHash} ` +
        `(block ${known.post.blockNumber}) not returned by the source.`,
    );
  }
  return { preFound, postFound };
}

async function scanFor(
  client: RoninDataClient,
  asset: Asset,
  known: KnownTransfer,
): Promise<boolean> {
  const target = known.txHash.toLowerCase();
  // A tight window around the known block keeps the probe cheap.
  for await (const t of client.fetchTransfers(
    asset,
    known.blockNumber,
    known.blockNumber,
  )) {
    if (t.txHash.toLowerCase() === target) return true;
  }
  return false;
}

/** Convenience predicate used by tests/reporting. */
export function eraFor(t: NormalizedTransfer): "legacy" | "l2" {
  return t.blockNumber < MIGRATION_BLOCK ? "legacy" : "l2";
}
