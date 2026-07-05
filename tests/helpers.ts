import type { NormalizedTransfer } from "@/lib/types";
import type { Asset } from "@/config/contracts";
import { ZERO_ADDRESS, isBurnAddress } from "@/config/contracts";

const BASE = new Date("2026-01-01T00:00:00.000Z").getTime();
const DAY = 86_400_000;

/** A date `n` days after the fixed test epoch. */
export function day(n: number): Date {
  return new Date(BASE + n * DAY);
}

let seq = 0;

/** Build a normalized transfer with sensible defaults. */
export function tx(
  asset: Asset,
  over: Partial<NormalizedTransfer> & { from: string; to: string },
): NormalizedTransfer {
  seq += 1;
  const from = over.from.toLowerCase();
  const to = over.to.toLowerCase();
  return {
    asset,
    txHash: over.txHash ?? `0x${seq.toString(16).padStart(8, "0")}`,
    logIndex: over.logIndex ?? 0,
    blockNumber: over.blockNumber ?? seq,
    blockTime: over.blockTime ?? day(0),
    from,
    to,
    tokenId: over.tokenId ?? null,
    quantity: over.quantity ?? 1n,
    isMint: over.isMint ?? from === ZERO_ADDRESS,
    isBurn: over.isBurn ?? isBurnAddress(to),
  };
}

// Common test addresses.
export const ADDR = {
  wallet: "0xa000000000000000000000000000000000000001",
  wallet2: "0xa000000000000000000000000000000000000002",
  external: "0xe000000000000000000000000000000000000009",
  marketplace: "0x3b3adf1422f84254b7fbb0e7ca62bd0865133fe3", // seed: counts_as_sell
  staking: "0xfff9ce5f71ca6178d3beecedb61e7eff1602950e", // seed: retain, not a sell
  zero: ZERO_ADDRESS,
};
