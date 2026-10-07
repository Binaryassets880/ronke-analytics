// Copy every table of the Ronke Score database from SOURCE to TARGET, then prove it.
//
//   SOURCE_URL=postgresql://...  TARGET_URL=postgresql://...  node copy-db.mjs [--yes]
//
// SOURCE is only ever read: the session is put in read-only mode before anything runs.
// TARGET must already have the schema (run `npm run migrate` in ronke-analytics with
// DATABASE_URL=TARGET first). Tables in TARGET are emptied and refilled. Without --yes it
// only reports what it would do.
import pg from "pg";
import { to as copyTo, from as copyFrom } from "pg-copy-streams";
import { pipeline } from "node:stream/promises";

const yes = process.argv.includes("--yes");
// Neon pooler endpoints run in transaction mode; the copy wants plain sessions, so use the direct host.
const direct = (u) => (u ? u.replace("-pooler.", ".") : u);
const SRC = direct(process.env.SOURCE_URL), DST = direct(process.env.TARGET_URL);
if (!SRC || !DST) { console.error("SOURCE_URL and TARGET_URL are required"); process.exit(2); }
if (SRC === DST) { console.error("SOURCE and TARGET are the same database"); process.exit(2); }

const host = (u) => { try { return new URL(u).host; } catch { return "?"; } };
const q = (id) => '"' + String(id).replace(/"/g, '""') + '"';
const ssl = (u) => (/localhost|127\.0\.0\.1/.test(u) ? false : { rejectUnauthorized: true });

const src = new pg.Client({ connectionString: SRC, ssl: ssl(SRC) });
const dst = new pg.Client({ connectionString: DST, ssl: ssl(DST) });
await src.connect(); await dst.connect();
await src.query("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY");   // the source cannot be written, by construction

const tables = async (c) => (await c.query(
  "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY 1")).rows.map((r) => r.table_name);
const cols = async (c, t) => (await c.query(
  "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position", [t])).rows.map((r) => r.column_name);
const count = async (c, t) => Number((await c.query(`SELECT count(*)::bigint AS n FROM ${q(t)}`)).rows[0].n);

const sT = await tables(src), dT = new Set(await tables(dst));
console.log(`source ${host(SRC)}: ${sT.length} tables | target ${host(DST)}: ${dT.size} tables | mode: ${yes ? "COPY" : "dry run"}`);
const missing = sT.filter((t) => !dT.has(t));
if (missing.length) { console.error("target lacks tables (run migrate first):", missing.join(", ")); process.exit(1); }

const plan = [];
for (const t of sT) {
  const sc = await cols(src, t), dc = new Set(await cols(dst, t));
  const lost = sc.filter((c) => !dc.has(c));
  if (lost.length) { console.error(`${t}: target lacks columns ${lost.join(", ")} (schema drift) - stopping`); process.exit(1); }
  plan.push({ t, cols: sc, n: await count(src, t) });
}
for (const p of plan) console.log(`  ${p.t.padEnd(22)} ${String(p.n).padStart(10)} rows`);
if (!yes) { console.log("\ndry run only - add --yes to copy"); process.exit(0); }

const t0 = Date.now();
for (const p of plan) {
  const list = p.cols.map(q).join(",");
  await dst.query("BEGIN");
  await dst.query(`TRUNCATE ${q(p.t)}`);
  await pipeline(src.query(copyTo(`COPY ${q(p.t)} (${list}) TO STDOUT (FORMAT binary)`)), dst.query(copyFrom(`COPY ${q(p.t)} (${list}) FROM STDIN (FORMAT binary)`)));
  await dst.query("COMMIT");
  process.stdout.write(`  copied ${p.t} (${p.n})\n`);
}
// serial columns: carry on numbering after the copied rows
const seqs = (await dst.query(`SELECT c.relname AS t, a.attname AS col, pg_get_serial_sequence(quote_ident(c.relname), a.attname) AS seq
  FROM pg_class c JOIN pg_attribute a ON a.attrelid=c.oid JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind='r' AND a.attnum>0 AND pg_get_serial_sequence(quote_ident(c.relname), a.attname) IS NOT NULL`)).rows;
for (const s of seqs) await dst.query(`SELECT setval($1, GREATEST(COALESCE((SELECT max(${q(s.col)}) FROM ${q(s.t)}), 0), 1), (SELECT count(*) > 0 FROM ${q(s.t)}))`, [s.seq]);

// proof: identical row counts everywhere, and an identical fingerprint of the scores themselves
let bad = 0;
for (const p of plan) { const n = await count(dst, p.t); if (n !== p.n) { bad++; console.error(`MISMATCH ${p.t}: source ${p.n} target ${n}`); } }
const fp = async (c) => {
  if (!sT.includes("wallet_scores")) return null;
  const r = await c.query(`SELECT md5(string_agg(t::text, '|' ORDER BY t::text)) AS h FROM wallet_scores t`);
  return r.rows[0].h;
};
const [a, b] = [await fp(src), await fp(dst)];
if (a !== b) { bad++; console.error("MISMATCH wallet_scores fingerprint", a, b); }
console.log(`\n${bad ? "FAILED" : "OK"}: ${plan.length} tables, ${plan.reduce((s, p) => s + p.n, 0)} rows, sequences ${seqs.length}, wallet_scores md5 ${b}, ${Math.round((Date.now() - t0) / 1000)} s`);
await src.end(); await dst.end();
process.exit(bad ? 1 : 0);
