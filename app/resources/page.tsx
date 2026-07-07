import type { Metadata } from "next";
import Link from "next/link";
import { CopyAddress } from "../components/CopyAddress";
import {
  VERIFIED_ADDRESSES,
  MARKET_LINKS,
  OFFICIAL_LINKS,
  GLOSSARY,
  explorerTokenUrl,
} from "@/config/resources";

export const metadata: Metadata = {
  title: "Resources",
  description:
    "Verified $RONKE and Ronkeverse contract addresses, where to buy and trade, official links, and a plain-English glossary.",
};

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function ResourcesPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Ronke Resources</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Everything you need to get into Ronke - verified addresses, where to buy and trade,
          and what the numbers mean.
        </p>
      </header>

      <Card title="Verified contract addresses">
        <p className="mb-4 text-sm text-[var(--muted)]">
          Always check the address before you swap or buy. Scammers deploy fakes with the same name.
        </p>
        <div className="space-y-4">
          {VERIFIED_ADDRESSES.map((row) => (
            <div key={row.address} className="rounded-lg border border-[var(--border)] bg-[var(--card-2)] p-3">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span className="font-medium">{row.label}</span>
                <span className="text-xs text-[var(--muted-2)]">{row.standard}</span>
                <Link
                  href={explorerTokenUrl(row.address)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-auto text-xs text-[var(--accent)] hover:underline"
                >
                  View on explorer ↗
                </Link>
              </div>
              <CopyAddress address={row.address} />
              {row.note && <p className="mt-2 text-xs text-[var(--muted-2)]">{row.note}</p>}
            </div>
          ))}
        </div>
      </Card>

      <Card title="Buy & trade">
        <ul className="space-y-3">
          {MARKET_LINKS.map((l) => (
            <li key={l.label}>
              <Link
                href={l.href}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-[var(--accent)] hover:underline"
              >
                {l.label} ↗
              </Link>
              <p className="text-sm text-[var(--muted)]">{l.blurb}</p>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Official links">
        <ul className="space-y-3">
          {OFFICIAL_LINKS.map((l) => (
            <li key={l.label}>
              {l.ready ? (
                <Link
                  href={l.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-[var(--accent)] hover:underline"
                >
                  {l.label} ↗
                </Link>
              ) : (
                <span className="font-medium text-[var(--muted-2)]">
                  {l.label} <span className="text-xs">(coming soon)</span>
                </span>
              )}
              <p className="text-sm text-[var(--muted)]">{l.blurb}</p>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Glossary">
        <dl className="grid gap-4 sm:grid-cols-2">
          {GLOSSARY.map((g) => (
            <div key={g.term}>
              <dt className="text-sm font-medium text-[var(--foreground)]">{g.term}</dt>
              <dd className="mt-0.5 text-sm text-[var(--muted)]">{g.definition}</dd>
            </div>
          ))}
        </dl>
      </Card>
    </div>
  );
}
