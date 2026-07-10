"use client";

import Link from "next/link";
import { Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { AssetToggle } from "./AssetToggle";
import { WalletSearch } from "./WalletSearch";
import { sectionFor } from "./EcosystemNav";

/**
 * Ronke Score section sub-nav. Renders only inside the analytics section
 * (hidden on Resources/Apps), so the analytics views keep their Overview /
 * Holders / Leaderboard / Rarity tabs, asset toggle, and wallet search while the
 * ecosystem bar above frames the whole site.
 *
 * `assetScoped` tabs read the `?asset=` param, so we carry the current asset
 * across those tabs - previously navigating reset the view back to $RONKE.
 * Rarity is Ronkeverse-only, so it neither carries nor shows the asset toggle.
 */
const LINKS = [
  { href: "/overview", label: "Overview", assetScoped: true },
  { href: "/holders", label: "Holders", assetScoped: true },
  { href: "/leaderboard", label: "Leaderboard", assetScoped: true },
  { href: "/rarity", label: "Rarity", assetScoped: false },
];

function NavInner() {
  const pathname = usePathname();
  const params = useSearchParams();
  const asset = params.get("asset");
  // Rarity is NFT-only; the asset toggle is meaningless there.
  const showToggle = !pathname.startsWith("/rarity");

  return (
    <div className="border-b border-[var(--border-soft)] bg-[var(--card-2)]/60">
      <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2.5 sm:px-6">
        <span className="text-sm font-semibold tracking-tight text-[var(--foreground)]">
          Analytics
        </span>
        <div className="flex gap-1 text-sm">
          {LINKS.map((l) => {
            const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
            // Preserve the selected asset when moving between asset-scoped tabs.
            const href = l.assetScoped && asset ? `${l.href}?asset=${asset}` : l.href;
            return (
              <Link
                key={l.href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`rounded-lg px-2.5 py-1 transition-colors ${
                  active
                    ? "bg-[var(--accent)]/12 text-[var(--accent)]"
                    : "text-[var(--muted)] hover:text-[var(--foreground)]"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </div>
        <div className="ml-auto flex items-center gap-3">
          {showToggle ? (
            <div className="flex items-center gap-2">
              <span className="hidden text-xs text-[var(--muted-2)] sm:inline">Viewing</span>
              <AssetToggle />
            </div>
          ) : null}
          <div className="hidden sm:block sm:w-64 lg:hidden">
            <WalletSearch compact />
          </div>
        </div>
      </nav>
    </div>
  );
}

export function Nav() {
  const pathname = usePathname();
  if (sectionFor(pathname) !== "rating") return null;
  // useSearchParams requires a Suspense boundary in the App Router.
  return (
    <Suspense fallback={null}>
      <NavInner />
    </Suspense>
  );
}
