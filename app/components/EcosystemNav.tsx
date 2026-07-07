"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { RonkeMark } from "./RonkeMark";
import { WalletSearch } from "./WalletSearch";

/**
 * Ecosystem-level top bar. The sticky, blurred Ronkeverse header that frames the
 * whole site into three sections. "Ronke Score" is the analytics app (every route
 * that isn't Resources or Apps); its section-scoped sub-nav (Nav) renders only
 * within it.
 */
const SECTIONS = [
  // Ronke Score and Leaderboard both live in the analytics ("rating") section;
  // `path` narrows the active highlight so only the matching one lights up.
  { href: "/overview", label: "Ronke Score", section: "rating", path: "/overview" },
  { href: "/leaderboard", label: "Leaderboard", section: "rating", path: "/leaderboard" },
  { href: "/resources", label: "Resources", section: "resources" },
  { href: "/apps", label: "Apps", section: "apps" },
] as const;

export type Section = "home" | "rating" | "resources" | "apps";

/**
 * Which ecosystem section a pathname belongs to. "/" is the landing (home);
 * Resources/Apps are their own sections; everything else (overview, holders,
 * leaderboard, rarity, wallet) is the Ronke Score section.
 */
export function sectionFor(pathname: string): Section {
  if (pathname === "/") return "home";
  if (pathname.startsWith("/resources")) return "resources";
  if (pathname.startsWith("/apps")) return "apps";
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
            // both analytics links don't highlight at once.
            const onLeaderboard = pathname.startsWith("/leaderboard");
            const isActive =
              "path" in s && s.path === "/leaderboard"
                ? onLeaderboard
                : "path" in s && s.path === "/overview"
                  ? active === "rating" && !onLeaderboard
                  : active === s.section;
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
        </div>
      </div>
    </header>
  );
}
