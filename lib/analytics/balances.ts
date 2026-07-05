/**
 * Current + historical holder balances from transfer_events (U5).
 *
 * Replays events in block order per asset. Retains exited holders as rows with
 * balance 0 / isCurrentHolder false - the daily new/exited time series (U6)
 * needs the full historical set; current-holder queries filter on
 * isCurrentHolder. Label-excluded addresses (contracts/burn/CEX) are dropped
 * from holder rows so they never inflate counts or concentration.
 */

import type { Asset } from "@/config/contracts";
import { contractFor } from "@/config/contracts";
import type { NormalizedTransfer } from "@/lib/types";
import type { Labels } from "./labels";
import type { HolderBalance } from "./types";

interface Mutable {
  balance: bigint;
  tokenCount: number;
  tokens: Set<string>;
  firstAcquiredAt: Date | null;
  lastActivityAt: Date | null;
}

/**
 * Compute holder balances. `events` must be sorted ascending by
 * (block_number, log_index). Returns one row per address that ever held,
 * excluding label-excluded addresses.
 */
export function computeBalances(
  asset: Asset,
  events: NormalizedTransfer[],
  labels: Labels,
): HolderBalance[] {
  const isNft = contractFor(asset).standard === "erc721";
  const state = new Map<string, Mutable>();

  const ensure = (addr: string): Mutable => {
    let s = state.get(addr);
    if (!s) {
      s = {
        balance: 0n,
        tokenCount: 0,
        tokens: new Set(),
        firstAcquiredAt: null,
        lastActivityAt: null,
      };
      state.set(addr, s);
    }
    return s;
  };

  for (const e of events) {
    // Inbound side (to).
    if (!labels.excludeFromHolders(e.to)) {
      const s = ensure(e.to);
      if (isNft) {
        if (e.tokenId != null && !s.tokens.has(e.tokenId)) {
          s.tokens.add(e.tokenId);
          s.tokenCount = s.tokens.size;
        }
      } else {
        s.balance += e.quantity;
      }
      if (s.firstAcquiredAt === null) s.firstAcquiredAt = e.blockTime;
      s.lastActivityAt = e.blockTime;
    }
    // Outbound side (from) - skip mints (from is zero/burn, already excluded).
    if (!labels.excludeFromHolders(e.from)) {
      const s = ensure(e.from);
      if (isNft) {
        if (e.tokenId != null && s.tokens.has(e.tokenId)) {
          s.tokens.delete(e.tokenId);
          s.tokenCount = s.tokens.size;
        }
      } else {
        s.balance -= e.quantity;
        if (s.balance < 0n) s.balance = 0n; // defensive
      }
      s.lastActivityAt = e.blockTime;
    }
  }

  const out: HolderBalance[] = [];
  for (const [address, s] of state) {
    const isCurrent = isNft ? s.tokenCount > 0 : s.balance > 0n;
    out.push({
      asset,
      address,
      balance: isNft ? 0n : s.balance,
      tokenCount: isNft ? s.tokenCount : 0,
      firstAcquiredAt: s.firstAcquiredAt,
      lastActivityAt: s.lastActivityAt,
      isCurrentHolder: isCurrent,
    });
  }
  return out;
}

/** Convenience: only the current holders. */
export function currentHolders(balances: HolderBalance[]): HolderBalance[] {
  return balances.filter((b) => b.isCurrentHolder);
}
