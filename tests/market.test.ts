import { describe, it, expect } from "vitest";
import { parseTokenMarket } from "@/lib/market/geckoterminal";
import {
  WRON_ADDRESS,
  TRANSFER_TOPIC,
  grossSalePrice,
  wronLegsFromReceipt,
  type WronLeg,
} from "@/lib/market/settlement";
import { computeTxSales, type NftTransferLeg } from "@/lib/market/sales";
import type { TransactionReceipt } from "viem";

const pad32 = (addr: string) => ("0x" + "0".repeat(24) + addr.slice(2).toLowerCase()) as `0x${string}`;
const valHex = (v: bigint) => ("0x" + v.toString(16).padStart(64, "0")) as `0x${string}`;

function wronLog(from: string, to: string, value: bigint) {
  return { address: WRON_ADDRESS, topics: [TRANSFER_TOPIC, pad32(from), pad32(to)], data: valHex(value) };
}
function receipt(logs: unknown[], to: string): TransactionReceipt {
  return { logs, to } as unknown as TransactionReceipt;
}

const SELLER = "0x" + "a".repeat(40);
const BUYER = "0x" + "b".repeat(40);
const ROYALTY = "0x" + "c".repeat(40);
const FEE = "0x" + "d".repeat(40);
const SEAPORT = "0x0000000000000068f116a894984e2db1123eb395";
const ESCROW = "0x3b3adf1422f84254b7fbb0e7ca62bd0865133fe3";

describe("parseTokenMarket (GeckoTerminal)", () => {
  it("extracts price, 24h volume, and liquidity from the token payload", () => {
    const body = {
      data: {
        attributes: {
          price_usd: "0.0002895663776",
          volume_usd: { h24: "648.12" },
          total_reserve_in_usd: "10968.4",
          market_cap_usd: "250000",
          fdv_usd: "251000",
        },
      },
    };
    const m = parseTokenMarket(body);
    expect(m.priceUsd).toBeCloseTo(0.0002895663776, 12);
    expect(m.volume24hUsd).toBeCloseTo(648.12, 2);
    expect(m.liquidityUsd).toBeCloseTo(10968.4, 1);
    expect(m.marketCapUsd).toBe(250000);
  });

  it("returns nulls for a missing/blank payload rather than throwing", () => {
    expect(parseTokenMarket({})).toEqual({
      priceUsd: null, volume24hUsd: null, liquidityUsd: null, marketCapUsd: null, fdvUsd: null,
    });
  });
});

describe("grossSalePrice (marketplace-agnostic)", () => {
  it("Seaport flow: buyer pays seller+royalty+fee directly -> gross is their sum", () => {
    const legs: WronLeg[] = [
      { from: BUYER, to: SELLER, value: 100n },
      { from: BUYER, to: ROYALTY, value: 5n },
      { from: BUYER, to: FEE, value: 2n },
    ];
    expect(grossSalePrice(legs, { buyer: BUYER, marketplace: SEAPORT })).toBe(107n);
  });

  it("escrow flow: excludes the buyer->escrow hop, keeps escrow payouts", () => {
    const legs: WronLeg[] = [
      { from: BUYER, to: ESCROW, value: 107n }, // buyer -> escrow (excluded)
      { from: ESCROW, to: SELLER, value: 100n },
      { from: ESCROW, to: ROYALTY, value: 5n },
      { from: ESCROW, to: FEE, value: 2n },
    ];
    expect(grossSalePrice(legs, { buyer: BUYER, marketplace: ESCROW })).toBe(107n);
  });

  it("excludes a refund leg back to the buyer", () => {
    const legs: WronLeg[] = [
      { from: BUYER, to: SELLER, value: 100n },
      { from: ESCROW, to: BUYER, value: 3n }, // change back
    ];
    expect(grossSalePrice(legs, { buyer: BUYER, marketplace: ESCROW })).toBe(100n);
  });
});

describe("wronLegsFromReceipt", () => {
  it("picks up only WRON Transfer logs and decodes from/to/value", () => {
    const r = receipt(
      [
        wronLog(BUYER, SELLER, 250n),
        { address: "0x" + "e".repeat(40), topics: [TRANSFER_TOPIC, pad32(BUYER), pad32(SELLER)], data: valHex(9n) }, // other token, ignored
      ],
      ESCROW,
    );
    const legs = wronLegsFromReceipt(r);
    expect(legs).toHaveLength(1);
    expect(legs[0]).toMatchObject({ to: SELLER, value: 250n });
  });
});

describe("computeTxSales", () => {
  const leg = (tokenId: string): NftTransferLeg => ({
    tokenId, seller: SELLER, buyer: BUYER, blockNumber: 100, blockTime: "2026-07-06T00:00:00.000Z",
  });

  it("records a single WRON-settled sale with the gross price", () => {
    const r = receipt([wronLog(BUYER, SELLER, 235n), wronLog(BUYER, FEE, 5n)], SEAPORT);
    const sales = computeTxSales([leg("42")], r);
    expect(sales).toHaveLength(1);
    expect(sales[0]).toMatchObject({ tokenId: "42", priceWron: 240n, marketplace: SEAPORT });
  });

  it("splits a bundle's gross evenly across the tokens moved", () => {
    const r = receipt([wronLog(BUYER, SELLER, 200n)], ESCROW);
    const sales = computeTxSales([leg("1"), leg("2")], r);
    expect(sales.map((s) => s.priceWron)).toEqual([100n, 100n]);
  });

  it("returns [] for a plain transfer with no WRON settlement", () => {
    const r = receipt([], SELLER);
    expect(computeTxSales([leg("7")], r)).toEqual([]);
  });
});
