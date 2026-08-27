import { ImageResponse } from "next/og";
import { getToken } from "@/lib/queries-cached";

/** Dynamic OG card for a token's rarity rank (U12). */
export const alt = "Ronkeverse token rarity";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ tokenId: string }> }) {
  const { tokenId } = await params;
  const token = await getToken(tokenId);
  const rank = token?.rarityRank ?? null;
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
        <div style={{ display: "flex", fontSize: 34, color: "#6ee7ff" }}>Ronke Analytics · Rarity</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 44 }}>Ronkeverse #{tokenId}</div>
          <div style={{ fontSize: 96, fontWeight: 700 }}>
            {rank != null ? `Rank #${rank}` : "Unrevealed"}
          </div>
        </div>
        <div style={{ display: "flex", fontSize: 28, color: "#a3a3a3" }}>
          {rank != null ? "OpenRarity information content" : "No traits indexed yet"}
        </div>
      </div>
    ),
    size,
  );
}
