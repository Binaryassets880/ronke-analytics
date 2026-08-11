"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { RonkeMark } from "./RonkeMark";
import { WalletSearch } from "./WalletSearch";
import { Tip } from "./Tip";

/**
 * Ecosystem-level top bar. The sticky, blurred Ronkeverse header that frames the
 * whole site. "Ronke Score" jumps to the score lookup on the landing page;
 * "Analytics" is the stats app (every route that isn't Resources or Apps), whose
 * section-scoped sub-nav (Nav) renders only within it.
 */
const SECTIONS = [
  // "Ronke Score" is the score entry point: it jumps to the score lookup on the
  // landing page (section: null = an action link, never section-highlighted; the
  // Home link covers "/"). The token/holder analytics live under "Analytics" so
  // the score name is never spent on a page of $RONKE stats.
  { href: "/#ronke-score", label: "Ronke Score", section: null, path: null },
  { href: "/overview", label: "Analytics", section: "rating", path: "/overview" },
  { href: "/leaderboard", label: "Leaderboard", section: "rating", path: "/leaderboard" },
  { href: "/resources", label: "Resources", section: "resources", path: null },
  { href: "/apps", label: "Apps", section: "apps", path: null },
  { href: "/developers", label: "Developers", section: "developers", path: null },
] as const;

export type Section = "home" | "rating" | "resources" | "apps" | "developers";

/**
 * Which ecosystem section a pathname belongs to. "/" is the landing (home);
 * Resources/Apps/Developers are their own sections; everything else (overview,
 * holders, leaderboard, rarity, wallet) is the Ronke Score section.
 *
 * Note the default: "rating" is the fallback, so any NEW route lands in the
 * analytics section unless it is claimed here. /developers is its own section
 * because it is a builder surface, not a stats page, and it must not light up
 * the Analytics tab.
 */
export function sectionFor(pathname: string): Section {
  if (pathname === "/") return "home";
  if (pathname.startsWith("/resources")) return "resources";
  if (pathname.startsWith("/apps")) return "apps";
  if (pathname.startsWith("/developers")) return "developers";
  return "rating";
}

export function EcosystemNav() {
  const pathname = usePathname();
  const active = sectionFor(pathname);

  return (
    <header
      className="sticky top-0 z-40 border-b border-[var(--border-soft)]"
      style={{ backdropFilter: "blur(14px)", background: "rgba(7,8,12,0.72)" }}
    >
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 sm:px-6">
        <RonkeMark />

        <nav className="rv-scroll ml-2 flex gap-6 overflow-x-auto">
          <Link
            href="/"
            aria-current={active === "home" ? "page" : undefined}
            className={`whitespace-nowrap text-sm font-medium ${
              active === "home" ? "text-[var(--foreground)]" : "text-[var(--muted)] hover:text-[var(--foreground)]"
            }`}
          >
            Home
          </Link>
          {SECTIONS.map((s) => {
            // Within the rating section, disambiguate Leaderboard vs the rest so
            // both analytics links don't highlight at once. Action links
            // (section: null) never highlight.
            const onLeaderboard = pathname.startsWith("/leaderboard");
            const isActive =
              s.path === "/leaderboard"
                ? onLeaderboard
                : s.path === "/overview"
                  ? active === "rating" && !onLeaderboard
                  : s.section != null && active === s.section;
            return (
              <Link
                key={s.label}
                href={s.href}
                aria-current={isActive ? "page" : undefined}
                className={`whitespace-nowrap text-sm font-medium ${
                  isActive ? "text-[var(--foreground)]" : "text-[var(--muted)] hover:text-[var(--foreground)]"
                }`}
              >
                {s.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-3">
          <div className="hidden lg:block lg:w-64">
            <WalletSearch compact />
          </div>
          <Tip
            placement="bottom"
            text="Live $RONKE price from GeckoTerminal (low-liquidity DEX quote). Opens the RONKE/WRON pool."
          >
            <a
              href="https://www.geckoterminal.com/ronin/pools/0x75ae353997242927c701d4d6c2722ebef43fd2d3"
              target="_blank"
              rel="noreferrer"
              className="mono flex items-center gap-2 rounded-full border border-[var(--border)] bg-[#0e1119] px-3 py-1.5 text-[12.5px]"
            >
              <span
                className="rv-glow h-[7px] w-[7px] rounded-full"
                style={{ background: "var(--diamond)", boxShadow: "0 0 8px var(--diamond)" }}
              />
              <span className="text-[var(--muted)]">$RONKE</span>
              <span className="font-bold text-[var(--foreground)]">live ↗</span>
            </a>
          </Tip>
        </div>
      </div>
    </header>
  );
}
