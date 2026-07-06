"use client";

import Link from "next/link";
import { Suspense } from "react";
import { usePathname } from "next/navigation";
import { AssetToggle } from "./AssetToggle";
import { WalletSearch } from "./WalletSearch";
import { sectionFor } from "./EcosystemNav";

/**
 * Ronke Score section sub-nav. Renders only inside the analytics section
 * (hidden on Resources/Apps), so the analytics views keep their Overview /
 * Holders / Leaderboard / Rarity tabs, asset toggle, and wallet search while the
 * ecosystem bar above frames the whole site.
 */
const LINKS = [
  { href: "/overview", label: "Overview" },
  { href: "/holders", label: "Holders" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/rarity", label: "Rarity" },
];

export function Nav() {
  const pathname = usePathname();
  if (sectionFor(pathname) !== "rating") return null;

  return (
    <div className="border-b border-[var(--border-soft)] bg-[var(--card-2)]/60">
      <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2.5 sm:px-6">
        <span className="text-sm font-semibold tracking-tight text-[var(--foreground)]">
          Ronke Score
        </span>
        <div className="flex gap-1 text-sm">
          {LINKS.map((l) => {
            const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`rounded-lg px-2.5 py-1 transition-colors ${
                  active
                    ? "bg-[var(--accent)]/12 text-[var(--accent)]"
                    : "text-[var(--muted)] hover:text-white"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </div>
        <div className="ml-auto flex items-center gap-3">
          <Suspense fallback={null}>
            <AssetToggle />
          </Suspense>
          <div className="hidden sm:block sm:w-64 lg:hidden">
            <WalletSearch compact />
          </div>
        </div>
      </nav>
    </div>
  );
}
