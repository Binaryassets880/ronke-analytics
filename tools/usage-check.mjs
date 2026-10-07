// How close Ronke Score is to its free-plan limits, with a projection to month end.
//
//   node tools/usage-check.mjs            (needs `vercel` and `neon` CLIs signed in)
//
// Vercel Hobby shows no billing usage to the CLI, so requests come from the firewall's own
// counter (last ~24h, every request it allowed or blocked) and are projected over 30 days.
// Neon reports its consumption on the project itself. Exit code 1 when anything is past 80%.
import { execFileSync } from "node:child_process";

const VERCEL_SCOPE = "g3nkas-projects";
const NEON_PROJECT = "shy-bonus-93497346";
const LIMITS = { vercelRequestsMonth: 1_000_000, neonCuHours: 100, neonStorageBytes: 1024 ** 3, neonTransferBytes: 5 * 1024 ** 3 };

const run = (cmd, args) => execFileSync(cmd, args, { encoding: "utf8", shell: process.platform === "win32", env: { ...process.env, MSYS_NO_PATHCONV: "1" }, stdio: ["ignore", "pipe", "ignore"] });
const pct = (x, lim) => Math.round((x / lim) * 1000) / 10;
const rows = [];
const add = (what, used, limit, unit, projected) => rows.push({ what, used, limit, unit, projected, p: pct(projected ?? used, limit) });

try {
  const fw = JSON.parse(run("vercel", ["firewall", "overview", "--json", "--scope", VERCEL_SCOPE]));
  const total = Object.entries(fw.stats || {}).filter(([k]) => k !== "attacksMitigated").reduce((s, [, v]) => s + (Number(v) || 0), 0);
  const hours = Math.max(1, (Date.parse(fw.period.end) - Date.parse(fw.period.start)) / 3600e3);
  add("Vercel requests (projected/month)", Math.round(total), LIMITS.vercelRequestsMonth, "req", Math.round((total / hours) * 24 * 30));
} catch (e) { console.log("Vercel: could not read firewall stats (run `vercel login`?)"); }

try {
  const p = JSON.parse(run("neon", ["api", `/projects/${NEON_PROJECT}`])).project;
  const start = Date.parse(p.consumption_period_start), end = Date.parse(p.consumption_period_end), now = Date.now();
  const frac = Math.min(1, Math.max(0.02, (now - start) / (end - start)));
  const cuh = p.compute_time_seconds / 3600;
  add("Neon compute (CU-hours, projected)", Math.round(cuh * 10) / 10, LIMITS.neonCuHours, "CU-h", Math.round((cuh / frac) * 10) / 10);
  add("Neon storage", p.synthetic_storage_size, LIMITS.neonStorageBytes, "bytes");
  add("Neon data transfer (projected)", p.data_transfer_bytes, LIMITS.neonTransferBytes, "bytes", Math.round(p.data_transfer_bytes / frac));
} catch (e) { console.log("Neon: could not read project (run `neon login`?)"); }

const fmt = (v, u) => (u === "bytes" ? (v / 1024 ** 2).toFixed(0) + " MB" : v.toLocaleString("en-US") + " " + u);
let worst = 0;
for (const r of rows) {
  worst = Math.max(worst, r.p);
  const flag = r.p >= 80 ? "RED  " : r.p >= 50 ? "AMBER" : "ok   ";
  console.log(`${flag} ${r.what.padEnd(36)} ${fmt(r.projected ?? r.used, r.unit).padStart(14)} of ${fmt(r.limit, r.unit)}  (${r.p}%)`);
}
if (worst >= 80) console.log("\nPast 80% of a free limit: find the caller (Vercel dashboard > Firewall > Traffic) or move that service to a paid plan.");
process.exit(worst >= 80 ? 1 : 0);
