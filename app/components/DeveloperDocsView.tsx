/**
 * Public API documentation, rendered from config/apiDocs.ts.
 *
 * Pure and prop-free: everything comes from the shared catalog, so the page,
 * the OpenAPI document, and the drift test can never disagree about what
 * endpoints exist.
 *
 * Ordering is intentional. The caveats come FIRST, before a single endpoint,
 * because each one produces a bug that looks like an API fault from the outside
 * (stale data read as broken, a retune read as an outage, a new player read as
 * an error). A developer who skims only the top of this page still gets them.
 */

import { API_BASE, ENDPOINTS, ERROR_REFERENCE, CAVEATS, type ApiEndpoint } from "@/config/apiDocs";

function Card({ title, children, id }: { title: string; children: React.ReactNode; id?: string }) {
  return (
    <section
      id={id}
      className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 scroll-mt-24"
    >
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Code({ children }: { children: string }) {
  return (
    <pre className="mono rv-scroll overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--card-2)] p-3 text-[12.5px] leading-relaxed">
      <code>{children}</code>
    </pre>
  );
}

function cacheLabel(seconds: number): string {
  if (seconds >= 3600) return `${Math.round(seconds / 3600)}h`;
  return `${Math.round(seconds / 60)} min`;
}

function Endpoint({ e }: { e: ApiEndpoint }) {
  const anchor = e.path.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
  return (
    <div id={anchor} className="scroll-mt-24 rounded-lg border border-[var(--border)] bg-[var(--card-2)] p-4">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="mono rounded border border-[var(--border)] px-1.5 py-0.5 text-[11px] font-bold text-[var(--diamond)]">
          GET
        </span>
        <span className="mono text-sm font-semibold break-all">
          {API_BASE}
          {e.path}
        </span>
        <span className="ml-auto text-xs text-[var(--muted-2)]">cached {cacheLabel(e.cacheSeconds)}</span>
      </div>

      <p className="mt-2 text-sm font-medium">{e.summary}</p>
      <p className="mt-1 text-sm text-[var(--muted)]">{e.description}</p>

      {e.params.length > 0 && (
        <div className="mt-3">
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--muted-2)]">
            Parameters
          </h4>
          <ul className="space-y-1.5">
            {e.params.map((p) => (
              <li key={p.name} className="text-sm text-[var(--muted)]">
                <span className="mono text-[var(--foreground)]">{p.name}</span>{" "}
                <span className="text-xs text-[var(--muted-2)]">
                  ({p.in}
                  {p.required ? ", required" : ", optional"}
                  {p.schema.default != null ? `, default ${p.schema.default}` : ""})
                </span>{" "}
                - {p.description}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-3">
        <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--muted-2)]">
          Example response
        </h4>
        <Code>{JSON.stringify(e.example, null, 2)}</Code>
      </div>
    </div>
  );
}

/** The first code block on the page: a correct gate, so copy-paste lands right. */
const LLMS_SNIPPET = `# Hand the whole API reference to a coding agent:
curl https://ronke-analytics.vercel.app/llms.txt

# ...or just paste that URL into the chat.`;

const QUICKSTART = `const res = await fetch(
  "${API_BASE}/score/0x36175b2c13e39de1a79583fa3476d124dc8dfb70"
);
const { data, meta } = await res.json();

// score, rank and percentile all come back. Build on whichever
// fits your design - and name your own tiers. We don't ship tier
// bands, because your game knows how many ranks it wants.
data.score;       // 4820   - what holders recognise
data.rank;        // 312    - null if the wallet has no score
data.percentile;  // 94.9   - out of meta.population scored wallets

console.log(data.score, data.rank, data.percentile, "as of", meta.as_of);`;

const BATCH_SNIPPET = `// One request, one cache entry - not 40 lookups.
const wallets = [...guildMembers].sort();          // sort = better cache hits
const res = await fetch(\`${API_BASE}/scores?addresses=\${wallets.join(",")}\`);
const { data } = await res.json();

for (const s of data.scores) {
  // found:false just means "no score yet" - never an error.
  await setRole(s.address, s.rank != null && s.rank <= 500 ? "og" : "member");
}`;

const RECHECK_SNIPPET = `// Only re-check when there IS new data. The rebuild runs once a
// day, so polling faster than that just burns requests.
let applied = null;

setInterval(async () => {
  // Cheap gate: has anything been rebuilt since we last acted?
  const meta = await (await fetch("${API_BASE}/meta")).json();
  if (meta.data.as_of === applied) return;

  const dump = await (await fetch("${API_BASE}/scores/all")).json();

  // Trust the DUMP's own as_of, not /meta's. They are cached separately, so
  // right after a rebuild /meta can report fresh data while the dump is still
  // serving the previous one. Skipping here just retries on the next tick.
  if (dump.meta.as_of !== meta.data.as_of) return;

  // Never prune on a partial set - you would strip roles from everyone
  // who happened to fall outside it.
  if (!dump.data.complete) return;

  const byAddress = new Map(dump.data.scores.map((s) => [s.address, s]));
  for (const member of guildMembers) {
    const s = byAddress.get(member.address.toLowerCase());
    // Absent = no score at all. That's your cue to remove the role.
    await setRole(member, s != null && s.rank <= 500 ? "og" : null);
  }
  applied = dump.meta.as_of;
}, 30 * 60 * 1000);`;

export function DeveloperDocsView() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Ronke Score API</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Read the Ronke Score, holdings, badges, and Ronkeverse rarity from your own game, bot,
          or site. Public, free, no key required, read-only.
        </p>
      </header>

      <Card title="Read this first" id="caveats">
        <div className="space-y-4">
          {CAVEATS.map((c) => (
            <div key={c.title}>
              <h3 className="text-sm font-semibold">{c.title}</h3>
              <p className="mt-1 text-sm text-[var(--muted)]">{c.body}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Building with an AI assistant?" id="llms">
        <p className="text-sm text-[var(--muted)]">
          Point it at{" "}
          <a className="mono text-[var(--accent)] hover:underline" href="/llms.txt">
            /llms.txt
          </a>
          . That is this entire reference - every endpoint, the caveats above, worked examples,
          and the error table - as one plain-text document written for a model to read. Paste the
          URL into Claude (or let an agent fetch it) and it has everything it needs to write a
          correct integration.
        </p>
        <div className="mt-3">
          <Code>{LLMS_SNIPPET}</Code>
        </div>
      </Card>

      <Card title="Quick start" id="quickstart">
        <p className="mb-3 text-sm text-[var(--muted)]">
          Every response is <span className="mono">{`{ data, meta }`}</span>. Errors are{" "}
          <span className="mono">{`{ error: { code, message } }`}</span>. CORS is open, so you can
          call this straight from a browser.
        </p>
        <Code>{QUICKSTART}</Code>
        <p className="mt-4 mb-3 text-sm text-[var(--muted)]">
          Checking a whole lobby or Discord guild? Use the batch endpoint - up to 50 wallets per
          request, so a few hundred members is a handful of calls, not hundreds.
        </p>
        <Code>{BATCH_SNIPPET}</Code>
        <p className="mt-4 mb-3 text-sm text-[var(--muted)]">
          Running a periodic re-check to prune roles from people who sold? Pull the whole scored
          set once and diff it locally. Watch <span className="mono">meta.as_of</span> so you only
          do the work when there is actually new data - the rebuild runs once a day, so a faster
          poll interval buys you nothing.
        </p>
        <Code>{RECHECK_SNIPPET}</Code>
      </Card>

      <Card title="Endpoints" id="endpoints">
        <div className="space-y-4">
          {ENDPOINTS.map((e) => (
            <Endpoint key={e.path} e={e} />
          ))}
        </div>
      </Card>

      <Card title="Errors" id="errors">
        <div className="rv-scroll overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-[var(--muted-2)]">
                <th className="py-2 pr-4 font-semibold">Code</th>
                <th className="py-2 pr-4 font-semibold">HTTP</th>
                <th className="py-2 font-semibold">Meaning</th>
              </tr>
            </thead>
            <tbody>
              {ERROR_REFERENCE.map((e) => (
                <tr key={e.code} className="border-t border-[var(--border)]">
                  <td className="mono py-2 pr-4 whitespace-nowrap">{e.code}</td>
                  <td className="mono py-2 pr-4 text-[var(--muted)]">{e.status}</td>
                  <td className="py-2 text-[var(--muted)]">{e.meaning}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Rate limits, versioning, and support" id="policy">
        <ul className="space-y-2 text-sm text-[var(--muted)]">
          <li>
            <span className="font-medium text-[var(--foreground)]">No API key.</span> Responses are
            cached at the edge, so ordinary use costs us nothing. Be reasonable: cache on your side
            too, and remember the data only changes once a day.
          </li>
          <li>
            <span className="font-medium text-[var(--foreground)]">Versioning.</span> Breaking
            changes ship under a new path ({API_BASE.replace("v1", "v2")}, and so on).{" "}
            <span className="mono">v1</span> keeps serving for at least 90 days after any successor
            is announced. Additive fields can appear in <span className="mono">v1</span> at any
            time, so parse defensively and ignore keys you do not recognise.
          </li>
          <li>
            <span className="font-medium text-[var(--foreground)]">Score retunes.</span> Changing
            the scoring weights requires community agreement, so it is rare and announced. If it
            does happen, <span className="mono">meta.score_version</span> changes with the weights,
            raw <span className="mono">score</span> magnitudes shift, and{" "}
            <span className="mono">rank</span> / <span className="mono">percentile</span> positions
            are unaffected.
          </li>
          <li>
            <span className="font-medium text-[var(--foreground)]">Machine-readable spec.</span>{" "}
            <a className="text-[var(--accent)] hover:underline" href={`${API_BASE}/openapi.json`}>
              {API_BASE}/openapi.json
            </a>
          </li>
        </ul>
      </Card>
    </div>
  );
}
