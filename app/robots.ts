import type { MetadataRoute } from "next";

/**
 * Crawlers (2026-10-07). Without a robots file every bot walked all ~6,400 wallet pages
 * and ~7,000 NFT pages - each one a function run and a database read on a free plan.
 * The landing, leaderboard, analytics and docs stay indexable; per-wallet and per-token
 * pages and the JSON API are left to people and integrations.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/wallet/", "/rarity/", "/holders"] }],
  };
}
