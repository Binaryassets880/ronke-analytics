# Ronke Analytics - how to work here

Conventions and gotchas. `HANDOFF.md` holds current state, `LOG.md` holds
history, `README.md` holds setup and architecture. This file holds the things
that have already cost a session.

## Verify what a person sees, not what the database says

**A correct number in `holder_metrics` is not a working feature.** Twice on
2026-08-23 the derived data was right and the rendered page was wrong, and both
were found by the owner opening the page after being told it was done:

1. The profile prints `never_sold` as a **"Never sold"** pill. The tier work
   redefined that flag to mean "no dumping episode" without touching the label,
   so a wallet with 99 sales carried it.
2. The tier popover rendered token figures in raw base units: `6.972e+22 of
   9.179e+24 tokens`.

Neither was visible in a query. Before claiming any user-facing change works:

```bash
curl -s "https://ronke-analytics.vercel.app/wallet/<addr>" | grep -o "<the label you changed>"
```

React SSR splits interpolated text, so grep for the static half of a string
(`"Worst month"`), never the whole rendered sentence.

## Renaming the meaning of a column renames it on screen

Several DB columns are rendered as plain-English pills and tooltips. If you
change what a column *means*, grep for every place its name reaches a user
before you ship:

```bash
grep -rn "neverSold\|never_sold\|everPaperSold\|ever_paper_sold" app lib config
```

The current contract, which the names now match on purpose:

| column | means |
|---|---|
| `never_sold` | `peak_sell_rate === 0`. Never disposed of a single unit. |
| `ever_paper_sold` | `episode_count > 0`. Ever dumped. Permanent; redemption clears the tier, not this. |
| `sell_count` | qualifying dumping episodes, NOT individual transfers |
| `diamond_bucket` | the tier, and the sole input to the score multiplier |

## Adding a column to holder_metrics is a three-file job

`persistSnapshot` deletes and re-inserts a fixed tuple, so a schema-only change
leaves the column at its default forever. All three, or none:

1. `db/schema.sql` - an idempotent `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`
   with a `DEFAULT` (the table is `NOT NULL`-heavy).
2. `lib/analytics/rebuild.ts` - the `insertMany` column list **and** the row
   tuple.
3. `lib/analytics/types.ts` - the `HolderMetric` field.

`db/migrate.ts` splits `schema.sql` on `;` after stripping `--` comments, so no
PL/pgSQL bodies, no semicolons inside string literals, no `--` inside a string.

## Deploy order when the read path gains a column

`getWallet` selects the tier columns. Deploying that before the columns exist
500s the wallet page. Always:

```bash
npm run migrate        # safe against the currently-deployed code
# merge + deploy
npm run seed-labels    # only if labels changed
npm run rebuild        # recompute derived tables
```

Seeding without rebuilding leaves `address_labels` and the derived tables
disagreeing, which is invisible until someone asks why a number moved.

## The nightly can silently revert you

`.github/workflows/sync.yml` runs at **07:00 UTC**, checks out `main`, and
rebuilds. If you rebuild production from a branch and do not merge it, the next
run recomputes everything with the old code and reverts you with nothing in the
logs. Either merge the same day or expect to re-run.

## Address labels: a wrong one is worse than a missing one

An unlabeled address already falls back to the safe default (counts as a
holder, outbound counts as a sale). Anything that overrides that default must
carry its evidence in the entry's `note` - there is a test that enforces it for
any label forgiving a sale.

Never write an address from memory. Derive candidates from `transfer_events` by
distinct counterparties, then confirm with evidence:

- **Is it a contract?** Ronin explorer `/api/v2/addresses/{hash}` -> `is_contract`.
  Of the 60 busiest unlabeled addresses, only 14 were. **EIP-7702 delegated EOAs
  report `is_contract: true` and are people** - never label one.
- **Router or not?** Same-transaction pass-through measured over our own
  `transfer_events`. A router never rests on a balance.
- **Custody or disposal?** For NFTs, what share of deposits return to the
  depositing wallet. `0x22e8eccc` returns 94%, which is how it was identified
  with no verified name.

`api.roninchain.com/rpc` rate-limits hard and rejects batched JSON-RPC; the
explorer tolerates ~300ms between calls.

## Git and deploys

- **Never override the commit identity.** `Story Lane <hello@storylanemedia.com>`
  is the account on the Vercel team. A commit authored `jhall830` makes the PR's
  preview build fail. See the root `CLAUDE.md` for the measured evidence.
- A stale `GITHUB_TOKEN` on this machine breaks `git push` and `gh` with a 401.
  `unset GITHUB_TOKEN GH_TOKEN` first.
- `npm run lint` fails on an eslintrc config-schema error unrelated to any
  change. Use `tsc --noEmit` and `npm test` as the real gates.
- **Never enable Vercel Deployment Protection for Production.** ronkeverse.com
  iframes production anonymously; SSO-gating it breaks the embed for everyone.
  Check `X-Frame-Options` is absent after any deploy that touches headers.
