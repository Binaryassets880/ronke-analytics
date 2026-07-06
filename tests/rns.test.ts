import { describe, it, expect } from "vitest";
import {
  nodeForName,
  reverseNode,
  isZeroAddress,
  resolveName,
  lookupName,
  type RnsReader,
} from "@/lib/rns/resolve";
import type { Address, Hex } from "viem";

const ZERO = "0x0000000000000000000000000000000000000000" as Address;
const RESOLVER = "0xadb077d236d9e81fb24b96ae9cb8089ab9942d48" as Address;

/**
 * Fake RNS reader driven by node-keyed maps, so the pure resolution logic is
 * tested without a live RPC. Unset lookups return the zero address / "".
 */
function fakeReader(cfg: {
  resolver?: Record<string, Address>;
  addr?: Record<string, Address>;
  name?: Record<string, string>;
}): RnsReader {
  return {
    resolverOf: async (node: Hex) => cfg.resolver?.[node] ?? ZERO,
    addrOf: async (_resolver: Address, node: Hex) => cfg.addr?.[node] ?? ZERO,
    nameOf: async (_resolver: Address, node: Hex) => cfg.name?.[node] ?? "",
  };
}

describe("namehash nodes", () => {
  it("hashes the empty name to the zero node and is deterministic", () => {
    expect(nodeForName("")).toBe("0x" + "0".repeat(64));
    expect(nodeForName("ronke.ron")).toBe(nodeForName("ronke.ron"));
    expect(nodeForName("ronke.ron")).not.toBe(nodeForName("other.ron"));
  });

  it("builds a lowercased addr.reverse node regardless of address case", () => {
    const mixed = "0xAbCdEf0000000000000000000000000000000001";
    expect(reverseNode(mixed)).toBe(reverseNode(mixed.toLowerCase()));
  });

  it("recognizes the zero address", () => {
    expect(isZeroAddress(ZERO)).toBe(true);
    expect(isZeroAddress(null)).toBe(true);
    expect(isZeroAddress(RESOLVER)).toBe(false);
  });
});

describe("resolveName (forward)", () => {
  it("resolves a name to a lowercased address", async () => {
    const node = nodeForName("ronke.ron");
    const reader = fakeReader({
      resolver: { [node]: RESOLVER },
      addr: { [node]: "0xABCDEF0000000000000000000000000000000009" as Address },
    });
    expect(await resolveName("ronke.ron", reader)).toBe(
      "0xabcdef0000000000000000000000000000000009",
    );
  });

  it("returns null when the name has no resolver or no address", async () => {
    expect(await resolveName("missing.ron", fakeReader({}))).toBeNull();
    const node = nodeForName("nameonly.ron");
    const reader = fakeReader({ resolver: { [node]: RESOLVER } }); // resolver set, addr unset
    expect(await resolveName("nameonly.ron", reader)).toBeNull();
  });
});

describe("lookupName (reverse, forward-verified)", () => {
  const address = "0x" + "a".repeat(40);

  it("returns the primary name when it forward-resolves back to the address", async () => {
    const rnode = reverseNode(address);
    const fnode = nodeForName("alice.ron");
    const reader = fakeReader({
      resolver: { [rnode]: RESOLVER, [fnode]: RESOLVER },
      name: { [rnode]: "alice.ron" },
      addr: { [fnode]: address as Address },
    });
    expect(await lookupName(address, reader)).toBe("alice.ron");
  });

  it("rejects a spoofed reverse name that resolves to a different address", async () => {
    const rnode = reverseNode(address);
    const fnode = nodeForName("bob.ron");
    const reader = fakeReader({
      resolver: { [rnode]: RESOLVER, [fnode]: RESOLVER },
      name: { [rnode]: "bob.ron" },
      addr: { [fnode]: ("0x" + "b".repeat(40)) as Address }, // forward points elsewhere
    });
    expect(await lookupName(address, reader)).toBeNull();
  });

  it("returns null when the address has no reverse record", async () => {
    expect(await lookupName(address, fakeReader({}))).toBeNull();
  });
});
