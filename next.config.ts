import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Remote NFT thumbnails come from IPFS gateways / Ronin metadata hosts.
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
    ],
  },
};

export default nextConfig;
