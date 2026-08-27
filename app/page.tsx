import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { getEcosystemStats, getDailyRandomToken, type DailyToken } from "@/lib/queries-cached";
import { StatTile } from "./components/StatTile";
import { WalletSearch } from "./components/WalletSearch";
import { BadgeCatalog } from "./components/BadgeCatalog";
import { formatCompact, formatUsd, formatRon } from "@/lib/format";

// ISR, not force-dynamic (2026-08-27, perf/neon-compute-cost). This page takes no
// searchParams, so the whole render is cacheable. It previously re-queried Neon on
// every request including every bot crawl, which is what kept this project's
// compute from ever scaling to zero. The data behind it moves once a day, when
// the sync Action rebuilds (.github/workflows/sync.yml).
export const revalidate = 3600;

export const metadata: Metadata = {
  title: { absolute: "Ronkeverse — the analytics home of the Blue Monke" },
  description:
    "The analytics home of the Blue Monke on Ronin: holder ratings, diamond-hands stats, badges, and rarity for $RONKE and Ronkeverse.",
};

const SECTIONS = [
  {
    href: "/overview",
    title: "Analytics",
    blurb: "Holder stats, diamond-hands data, leaderboards, and Ronkeverse rarity.",
    emoji: "\u{1F4CA}", // 📊
  },
  {
    href: "/resources",
    title: "Resources",
    blurb: "Verified contracts, where to buy and trade, and what the numbers mean.",
    emoji: "\u{1F4DA}", // 📚
  },
  {
    href: "/apps",
    title: "Apps",
    blurb: "Games and tools in the Ronke ecosystem.",
    emoji: "\u{1F3AE}", // 🎮
  },
];

export default async function LandingPage() {
  const daySeed = new Date().toISOString().slice(0, 10); // UTC YYYY-MM-DD
  const [stats, dailyRonke] = await Promise.all([
    getEcosystemStats(),
    getDailyRandomToken(daySeed),
  ]);

  return (
    <div className="space-y-16">
      {/* Hero */}
      <section className="grid items-center gap-10 pt-6 md:grid-cols-[1.15fr_0.85fr] md:gap-12">
        <div>
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[#0e1119] px-3.5 py-1.5 text-[13px] text-[var(--muted)]">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--accent)" }} />
            The analytics home of the Blue Monke · on Ronin
          </div>
          <h1
            className="font-bold"
            style={{ fontSize: "clamp(40px,7vw,64px)", lineHeight: 0.98, letterSpacing: "-0.035em" }}
          >
            Know the
            <br />
            <span
              style={{
                background: "linear-gradient(120deg, var(--accent), var(--accent-soft))",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              Ronkeverse.
            </span>
          </h1>
          <p className="mt-5 max-w-xl text-[var(--muted)]" style={{ fontSize: "clamp(16px,2vw,18px)", lineHeight: 1.55 }}>
            Track holders, diamond hands, rarity and your{" "}
            <strong className="font-semibold text-[var(--foreground)]">Ronke Score</strong> across{" "}
            <strong className="font-semibold text-[var(--foreground)]">$RONKE</strong> and{" "}
            <strong className="font-semibold text-[var(--foreground)]">Ronkeverse</strong> — where the meme meets the data. 🍚
          </p>
          <div className="mt-8 flex flex-wrap gap-3.5">
            <Link
              href="#ronke-score"
              className="rounded-2xl px-6 py-3.5 text-[15px] font-bold text-[#04121c]"
              style={{ background: "var(--accent)", boxShadow: "0 8px 30px rgba(39,185,252,0.32)" }}
            >
              What&rsquo;s your Ronke Score?
            </Link>
            <Link
              href="/leaderboard"
              className="rounded-2xl border border-[var(--border-strong)] bg-[#11141d] px-6 py-3.5 text-[15px] font-semibold text-[var(--foreground)] hover:border-[var(--accent)]"
            >
              🏆 View leaderboard
            </Link>
          </div>
          <div className="mt-10 flex flex-wrap items-center gap-x-7 gap-y-4">
            <HeroStat value={formatCompact(stats.ronkeHolders)} label="$RONKE holders" />
            <span className="h-8 w-px bg-[var(--border)]" />
            <HeroStat value={formatCompact(stats.ronkeverseHolders)} label="Ronkeverse holders" />
            <span className="h-8 w-px bg-[var(--border)]" />
            <HeroStat value={formatCompact(stats.ratedWallets)} label="Wallets rated" accent />
          </div>
        </div>

        {/* Today's Random Ronke */}
        <div className="relative hidden items-center justify-center md:flex">
          <div
            className="absolute h-80 w-80 rounded-full"
            style={{ background: "radial-gradient(circle, rgba(39,185,252,0.28), transparent 65%)", filter: "blur(10px)" }}
          />
          <DailyRonkeCard token={dailyRonke} />
        </div>
      </section>

      {/* Ecosystem stat strip */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
            Ecosystem at a glance
          </h2>
        </div>
        <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-6">
          <StatTile label="$RONKE Price" value={formatUsd(stats.ronkePriceUsd)} />
          <StatTile label="$RONKE Holders" value={formatCompact(stats.ronkeHolders)} />
          <StatTile label="Ronkeverse Holders" value={formatCompact(stats.ronkeverseHolders)} />
          <StatTile label="Ronkeverse 7d Vol" value={formatRon(stats.ronkeverse7dVolWron)} />
          <StatTile label="Wallets Rated" value={formatCompact(stats.ratedWallets)} />
          <StatTile label="Badges Earned" value={formatCompact(stats.totalBadges)} />
        </div>
      </section>

      {/* Ronke Score search - the interactive hook */}
      <section
        id="ronke-score"
        className="relative scroll-mt-24 overflow-hidden rounded-[28px] border border-[#1c2a3a] p-8 sm:p-11"
        style={{ background: "linear-gradient(160deg, #0e1621, #0b0d14 55%)" }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -right-10 -top-20 h-80 w-80"
          style={{ background: "radial-gradient(circle, rgba(39,185,252,0.16), transparent 65%)" }}
        />
        <div className="relative max-w-2xl">
          <div
            className="mb-4 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[12.5px] font-semibold"
            style={{
              background: "rgba(39,185,252,0.12)",
              border: "1px solid rgba(39,185,252,0.3)",
              color: "var(--accent)",
            }}
          >
            📊 RONKE SCORE
          </div>
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">What&rsquo;s your Ronke Score?</h2>
          <p className="mt-2 text-[var(--muted)]">
            Look up any wallet or <span className="mono text-[var(--foreground)]">.ron</span> name to open its full
            profile — score, holdings, diamond-hands and badges.
          </p>
          <div className="mt-5 max-w-xl">
            <WalletSearch />
          </div>
          <p className="mt-4 text-sm">
            <Link href="/resources#ronke-score" className="font-medium text-[var(--accent)] hover:underline">
              How the Ronke Score works →
            </Link>
          </p>
        </div>
      </section>

      {/* Section orientation cards */}
      <section className="grid gap-4 sm:grid-cols-3">
        {SECTIONS.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 transition-all hover:-translate-y-0.5 hover:border-[var(--accent)]"
          >
            <div className="text-2xl" aria-hidden>
              {s.emoji}
            </div>
            <div className="mt-3 text-lg font-semibold">{s.title}</div>
            <p className="mt-1.5 text-sm text-[var(--muted)]">{s.blurb}</p>
          </Link>
        ))}
      </section>

      {/* Badge gallery */}
      <BadgeCatalog />
    </div>
  );
}

function DailyRonkeCard({ token }: { token: DailyToken | null }) {
  const cardStyle = {
    background: "repeating-linear-gradient(45deg, #0d1017, #0d1017 12px, #10141d 12px, #10141d 24px)",
    boxShadow: "0 30px 80px rgba(0,0,0,0.5)",
  } as const;

  const body = (
    <>
      <div className="mono flex items-center gap-2 text-[11px] uppercase tracking-[0.12em] text-[var(--muted-2)]">
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--accent)" }} />
        Today&rsquo;s Random Ronke
      </div>

      {token ? (
        <Image
          src={token.imageUrl}
          alt={`Ronkeverse #${token.tokenId}`}
          width={260}
          height={260}
          unoptimized
          className="h-[260px] w-[260px] rounded-2xl border border-[var(--border-strong)] object-cover"
          style={{ boxShadow: "0 12px 40px rgba(0,0,0,0.5)" }}
          priority
        />
      ) : (
        <Image
          src="/mascot/ronke-mascot.png"
          alt="Ronke, the Blue Monke"
          width={240}
          height={240}
          className="h-[240px] w-auto object-contain"
          style={{ filter: "drop-shadow(0 0 24px rgba(39,185,252,0.5))" }}
          priority
        />
      )}

      <div className="mono flex items-center gap-2 rounded-full border border-[var(--border-strong)] bg-[rgba(7,8,12,0.85)] px-3.5 py-1.5 text-[13px]">
        {token ? (
          <>
            <span className="font-bold">Ronke #{token.tokenId}</span>
            {token.rarityRank != null ? (
              <span style={{ color: "var(--accent)" }}>· rank {token.rarityRank}</span>
            ) : null}
          </>
        ) : (
          <span>
            Ronke · <span style={{ color: "var(--accent)" }}>the Blue Monke</span>
          </span>
        )}
      </div>
    </>
  );

  const className =
    "rv-float relative flex h-[380px] w-[340px] flex-col items-center justify-center gap-5 rounded-3xl border border-[var(--border-strong)] px-6";

  return token ? (
    <Link href={`/rarity/${token.tokenId}`} className={className} style={cardStyle}>
      {body}
    </Link>
  ) : (
    <div className={className} style={cardStyle}>
      {body}
    </div>
  );
}

function HeroStat({ value, label, accent = false }: { value: string; label: string; accent?: boolean }) {
  return (
    <div>
      <div
        className="mono text-[26px] font-bold"
        style={accent ? { color: "var(--diamond)" } : undefined}
      >
        {value}
      </div>
      <div className="mt-0.5 text-[13px] text-[var(--muted-2)]">{label}</div>
    </div>
  );
}
