import { ImageResponse } from "next/og";
import { getWallet, getWalletBadges } from "@/lib/queries";
import { badgeDef } from "@/config/badges";
import { normalizeAddress, shortAddress, formatDuration, formatCompact, toWholeTokens } from "@/lib/format";

/**
 * Dynamic OG/share card for a wallet (U8, top badges added in U15). Renders the
 * diamond bucket + holding duration + top badges so a pasted /wallet/0x… link
 * previews richly in Discord/X.
 */
export const alt = "Ronke Analytics wallet profile";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const BUCKET_ICON: Record<string, string> = {
  diamond: "\u{1F48E}",
  regular: "\u{270B}",
  paper: "\u{1F9FB}",
};

export default async function Image({ params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  const normalized = normalizeAddress(decodeURIComponent(address));
  const wallet = normalized ? await getWallet(normalized) : null;
  const badges = normalized ? await getWalletBadges(normalized) : [];
  const topBadges = badges
    .map((b) => badgeDef(b.badgeKey))
    .filter((d): d is NonNullable<typeof d> => !!d)
    .slice(0, 5);

  const bucket = wallet?.diamondBucket ?? "paper";
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#0b0b0f",
          color: "#ededed",
          padding: 64,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", fontSize: 34, color: "#6ee7ff" }}>Ronke Analytics</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 40 }}>{normalized ? shortAddress(normalized) : "Unknown wallet"}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 64, fontWeight: 700 }}>
            <span>{BUCKET_ICON[bucket]}</span>
            <span>{bucket[0].toUpperCase() + bucket.slice(1)} hands</span>
          </div>
          <div style={{ fontSize: 30, color: "#a3a3a3" }}>
            {wallet
              ? `Held ${formatDuration(wallet.holdingDurationDays)} · ${formatCompact(
                  toWholeTokens(BigInt(wallet.ronkeBalance || "0")),
                )} $RONKE · ${wallet.ronkeverseCount} Ronkeverse`
              : "No holdings"}
          </div>
        </div>
        <div style={{ display: "flex", gap: 12, fontSize: 40 }}>
          {topBadges.map((d) => (
            <span key={d.key}>{d.icon}</span>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
