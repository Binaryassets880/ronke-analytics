import Link from "next/link";
import { Suspense } from "react";
import { AssetToggle } from "./AssetToggle";
import { WalletSearch } from "./WalletSearch";

const LINKS = [
  { href: "/", label: "Overview" },
  { href: "/holders", label: "Holders" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/rarity", label: "Rarity" },
];

export function Nav() {
  return (
    <header className="border-b border-[var(--border)]">
      <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <Link href="/" className="font-semibold tracking-tight">
          Ronke Analytics
        </Link>
        <div className="flex gap-4 text-sm text-neutral-300">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="hover:text-white">
              {l.label}
            </Link>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-3">
          <Suspense fallback={null}>
            <AssetToggle />
          </Suspense>
          <div className="hidden sm:block sm:w-72">
            <WalletSearch compact />
          </div>
        </div>
      </nav>
    </header>
  );
}
