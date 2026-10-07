// readEventsCached must return exactly what readEvents returns, in every situation.
import { createRequire } from "node:module";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os"; import { join } from "node:path";
const req = createRequire("C:/Users/p3p3l/AppData/Local/Temp/claude/C--Users-p3p3l-Downloads-lenta/1251ca5a-411f-42a4-8209-9abfc544f727/scratchpad/dbcopy/package.json");
const pg = req("pg"); const EmbeddedPostgres = req("embedded-postgres").default;
import { readEvents } from "@/lib/analytics/rebuild";
import { readEventsCached } from "@/lib/analytics/event-cache";
const PORT = 54331;
const pgs = new EmbeddedPostgres({ databaseDir: join(tmpdir(), "evcache-" + Date.now()), user: "postgres", password: "pw", port: PORT, persistent: false });
let pass = 0, fail = 0; const ok = (c: boolean, m: string) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };
await pgs.initialise(); await pgs.start();
try {
  await pgs.createDatabase("t");
  const c = new pg.Client(`postgresql://postgres:pw@localhost:${PORT}/t`); await c.connect();
  const schema = readFileSync("db/schema.sql", "utf8").split("\n").map((l) => { const i = l.indexOf("--"); return i < 0 ? l : l.slice(0, i); }).join("\n").split(";").map((s) => s.trim()).filter(Boolean);
  for (const s of schema) await c.query(s);
  const sql: any = (strings: any) => { throw new Error("tagged sql not used here"); };
  let rowsOut = 0;
  sql.query = async (text: string, params: unknown[], opts?: { arrayMode?: boolean }) => { const r = await c.query({ text, values: params, rowMode: opts?.arrayMode ? "array" : undefined }); rowsOut += r.rows.length; return r.rows; };
  const ins = (asset: string, from: number, n: number, blockBase: number) => c.query(`INSERT INTO transfer_events (asset,tx_hash,log_index,block_number,block_time,from_address,to_address,token_id,quantity)
    SELECT $1, md5($1||g::text||$4::text), (g*7)%50, $3 + g*3 + (g%5), timestamptz '2026-01-01' + (($3+g)::text||' seconds')::interval, '0xf'||(g%97), '0xt'||(g%89), CASE WHEN $1='ronkeverse_nft' THEN (g%300)::text END, (g::numeric*1000000000000000000+g)
    FROM generate_series($2::int, $2::int+$5::int-1) g ON CONFLICT DO NOTHING`, [asset, from, blockBase, Date.now(), n]);
  await ins("ronke_token", 1, 30000, 1000000); await ins("ronkeverse_nft", 1, 5000, 1000000);
  const dir = mkdtempSync(join(tmpdir(), "evc-")); const same = (a: any[], b: any[]) => JSON.stringify(a, (_, v) => typeof v === "bigint" ? v.toString() : v) === JSON.stringify(b, (_, v) => typeof v === "bigint" ? v.toString() : v);
  const check = async (label: string, asset: any, expectMode: string, now = new Date()) => {
    const full = await readEvents(sql, asset); rowsOut = 0;
    const r = await readEventsCached(sql, asset, dir, now); const fetched = rowsOut;
    ok(same(full, r.events) && r.report.mode === expectMode, `${label}: ${r.report.mode} (${r.report.reason}) identical=${same(full, r.events)} rows=${full.length} read-from-db=${fetched}`);
    return r;
  };
  await check("first run, no cache", "ronke_token", "full");
  await check("second run, nothing new", "ronke_token", "delta");
  await ins("ronke_token", 40001, 500, 2000000); await check("500 new events", "ronke_token", "delta");
  await ins("ronke_token", 50001, 50, 900000); await check("50 OLDER events backfilled (lower blocks)", "ronke_token", "delta");
  await c.query("DELETE FROM transfer_events WHERE id IN (SELECT id FROM transfer_events WHERE asset='ronke_token' ORDER BY id LIMIT 3)"); await check("3 rows deleted -> count mismatch", "ronke_token", "full");
  await check("8 days later -> weekly full read", "ronke_token", "full", new Date(Date.now() + 8 * 86400e3));
  writeFileSync(join(dir, "ronke_token.json.gz"), "garbage"); await check("corrupt cache file", "ronke_token", "full");
  await check("other asset (NFT) cached separately", "ronkeverse_nft", "full"); await check("NFT second run", "ronkeverse_nft", "delta");
  await c.end();
} finally { await pgs.stop(); }
console.log(`\n${pass} PASS / ${fail} FAIL`); process.exit(fail ? 1 : 0);
