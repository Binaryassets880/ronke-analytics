import type { Sql } from "@/db/client";
import type { NormalizedTransfer } from "@/lib/types";
import type { Asset } from "@/config/contracts";
import { tx } from "./helpers";

/**
 * A stateful in-memory fake of the Neon tagged-template `sql`, modeling just
 * the queries the ingestion path issues: sync_cursor get/set, transfer_events
 * append with ON CONFLICT dedup, and meta. Returns rows shaped like Neon.
 */
export function makeFakeDb() {
  const cursors = new Map<string, number>();
  const events = new Set<string>();
  const meta = new Map<string, string>();

  const sql = ((strings: TemplateStringsArray, ...vals: unknown[]) => {
    const text = strings.join("§");
    if (text.includes("SELECT last_block FROM sync_cursor")) {
      const asset = String(vals[0]);
      return Promise.resolve(cursors.has(asset) ? [{ last_block: cursors.get(asset) }] : []);
    }
    if (text.includes("INSERT INTO sync_cursor")) {
      cursors.set(String(vals[0]), Number(vals[1]));
      return Promise.resolve([]);
    }
    if (text.includes("INSERT INTO transfer_events")) {
      const key = `${vals[0]}|${vals[1]}|${vals[2]}`;
      if (events.has(key)) return Promise.resolve([]); // ON CONFLICT DO NOTHING
      events.add(key);
      return Promise.resolve([{ id: events.size }]);
    }
    if (text.includes("INSERT INTO meta")) {
      meta.set(String(vals[0]), String(vals[1]));
      return Promise.resolve([]);
    }
    if (text.includes("SELECT value FROM meta")) {
      const k = String(vals[0]);
      return Promise.resolve(meta.has(k) ? [{ value: meta.get(k) }] : []);
    }
    return Promise.resolve([]);
  }) as unknown as Sql;

  return {
    sql,
    cursors,
    meta,
    eventCount: () => events.size,
  };
}

/** A fake client mirroring RoninDataClient's backfill + incremental methods. */
export function makeFakeClient(dataset: Record<string, NormalizedTransfer[]>) {
  return {
    // Backfill path: everything in [fromBlock, toBlock].
    async *fetchTransfers(asset: Asset, fromBlock = 0, toBlock?: number) {
      for (const t of dataset[asset] ?? []) {
        if (t.blockNumber < fromBlock) continue;
        if (toBlock != null && t.blockNumber > toBlock) continue;
        yield t;
      }
    },
    // Incremental path: only the tail strictly newer than sinceBlock.
    async *fetchNewTransfers(asset: Asset, sinceBlock: number) {
      for (const t of dataset[asset] ?? []) {
        if (t.blockNumber > sinceBlock) yield t;
      }
    },
  };
}

export { tx };
