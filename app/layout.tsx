import type { Metadata } from "next";
import { Space_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { EcosystemNav } from "./components/EcosystemNav";
import { Nav } from "./components/Nav";
import { SiteFooter } from "./components/SiteFooter";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-space-grotesk",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Ronkeverse",
    template: "%s · Ronkeverse",
  },
  description:
    "The analytics home of the Blue Monke. Holder ratings, diamond-hands stats, and rarity for $RONKE and Ronkeverse on Ronin, plus resources and apps.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${spaceGrotesk.variable} ${jetbrainsMono.variable}`}>
      <body className="relative min-h-screen">
        {/* Ambient hero glow behind everything. */}
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-[-260px] z-0 h-[620px] w-[1100px] max-w-[120vw] -translate-x-1/2"
          style={{
            background:
              "radial-gradient(ellipse at center, rgba(39,185,252,0.20), transparent 62%)",
          }}
        />
        <div className="relative z-10">
          <EcosystemNav />
          <Nav />
          <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
          <SiteFooter />
        </div>
      </body>
    </html>
  );
}
