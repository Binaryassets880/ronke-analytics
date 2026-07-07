/**
 * Ronke Score simulator (S-series). Pure "what-if" layer over the real scoring
 * engine: takes a wallet's actual ScoreInput, applies user knobs (buy more, hold
 * longer, collect bodies, grab 1/1s), and re-runs computeScore - so the simulated
 * number obeys every real formula oddity (gates, weighted-age dilution, the
 * 24-month cap, diamond multipliers, sub-linear NFT curves).
 *
 * Also generates the plain-English notes that tell a holder WHY the number moved
 * ("you crossed the 50k gate", "buying diluted your holding clock"), which is the
 * whole point of the calculator: making the score legible enough to critique.
 */

import { SCORE_CONFIG as C } from "@/config/score";
import {
  computeScore,
  type AssetHold,
  type ScoreInput,
  type ScoreResult,
} from "./compute";

/** Everything the user can tweak. All deltas are "on top of what you hold now". */
export interface SimKnobs {
  /** Whole $RONKE bought today. */
  addRonke: number;
  /** Whole RonkeStr bought today. */
  addRonkestr: number;
  /** Ronkeverse NFTs bought today, by representative rarity tier. */
  addCommonNfts: number;
  addRareNfts: number;
  /** 1/1 pieces bought today (each is also an NFT at rarity factor 1.0). */
  addOneOfOnes: number;
  /** NEW distinct Body types those purchases complete. */
  newBodyTypes: number;
  /** Days of holding into the future (applies to everything held). */
  holdMoreDays: number;
}

export const EMPTY_KNOBS: SimKnobs = {
  addRonke: 0,
  addRonkestr: 0,
  addCommonNfts: 0,
  addRareNfts: 0,
  addOneOfOnes: 0,
  newBodyTypes: 0,
  holdMoreDays: 0,
};

/** A zeroed wallet, for calculator use without loading a real address. */
export function emptyScoreInput(bodyTypesTotal = 10): ScoreInput {
  return {
    ronkeBalanceWhole: 0,
    ronkeHold: null,
    ronkestrBalanceWhole: 0,
    ronkestrHold: null,
    nftRarityFactors: [],
    nftHold: null,
    bodyTypesHeld: 0,
    bodyTypesTotal,
    oneOfOneCount: 0,
  };
}

/**
 * Representative rarity factors for simulated NFT buys. The real factor is
 * (revealedSupply - rank + 1) / revealedSupply, uniform in (0,1] across the
 * collection: a floor piece sits near 0, the median at 0.5, top-10% at 0.9+.
 */
export const SIM_RARITY = {
  common: 0.15,
  rare: 0.9,
  oneOfOne: 1.0,
} as const;

const clampNonNeg = (n: number) => (Number.isFinite(n) ? Math.max(0, n) : 0);

/**
 * Age a quantity-weighted holding clock through a buy-today-then-wait scenario.
 * Existing units age by `days`; units bought today age from 0 to `days`. This is
 * exactly how holder_metrics.weighted_duration_days behaves: topping up pulls
 * the clock toward the fresh units before it starts growing again.
 */
function agedWeightedDays(oldQty: number, oldDays: number, addQty: number, days: number): number {
  const newQty = oldQty + addQty;
  if (newQty <= 0) return oldDays + days;
  return (oldQty * (oldDays + days) + addQty * days) / newQty;
}

/** Weighted age the instant after buying, before any extra days pass. */
export function dilutedDays(oldQty: number, oldDays: number, addQty: number): number {
  return agedWeightedDays(oldQty, oldDays, addQty, 0);
}

function simulateHold(
  oldQty: number,
  hold: AssetHold | null,
  addQty: number,
  days: number,
): AssetHold | null {
  const newQty = oldQty + addQty;
  if (newQty <= 0) return hold; // still holding nothing - clock is moot (and gated off anyway)
  return {
    durationDays: agedWeightedDays(oldQty, hold?.durationDays ?? 0, addQty, days),
    // A wallet with no history starts with a clean never-sold slate; an existing
    // history keeps its behavioral flags - buying more can't undo a past sell.
    neverSold: hold ? hold.neverSold : true,
    everPaperSold: hold ? hold.everPaperSold : false,
  };
}

/** Apply the knobs to a real ScoreInput, modeling every engine oddity. */
export function applyKnobs(base: ScoreInput, knobs: SimKnobs): ScoreInput {
  const days = clampNonNeg(knobs.holdMoreDays);
  const addRonke = clampNonNeg(knobs.addRonke);
  const addRonkestr = clampNonNeg(knobs.addRonkestr);
  const addCommons = Math.floor(clampNonNeg(knobs.addCommonNfts));
  const addRares = Math.floor(clampNonNeg(knobs.addRareNfts));
  const addOnes = Math.floor(clampNonNeg(knobs.addOneOfOnes));

  const addedFactors = [
    ...Array<number>(addCommons).fill(SIM_RARITY.common),
    ...Array<number>(addRares).fill(SIM_RARITY.rare),
    ...Array<number>(addOnes).fill(SIM_RARITY.oneOfOne),
  ];
  const oldCount = base.nftRarityFactors.length;
  const newCount = oldCount + addedFactors.length;

  // Body types can't exceed the collection's total or the number of NFTs held.
  const bodyCap = Math.min(
    base.bodyTypesTotal > 0 ? base.bodyTypesTotal : Infinity,
    newCount,
  );
  const bodyTypesHeld = Math.min(
    base.bodyTypesHeld + Math.floor(clampNonNeg(knobs.newBodyTypes)),
    bodyCap,
  );

  return {
    ronkeBalanceWhole: base.ronkeBalanceWhole + addRonke,
    ronkeHold: simulateHold(base.ronkeBalanceWhole, base.ronkeHold, addRonke, days),
    ronkestrBalanceWhole: base.ronkestrBalanceWhole + addRonkestr,
    ronkestrHold: simulateHold(base.ronkestrBalanceWhole, base.ronkestrHold, addRonkestr, days),
    nftRarityFactors: [...base.nftRarityFactors, ...addedFactors],
    nftHold: simulateHold(oldCount, base.nftHold, addedFactors.length, days),
    bodyTypesHeld,
    bodyTypesTotal: base.bodyTypesTotal,
    oneOfOneCount: base.oneOfOneCount + addOnes,
  };
}

/** One plain-English "why it changed" note. */
export interface SimNote {
  emoji: string;
  text: string;
  /** gain = something unlocked/earned, loss = a mechanic worked against you, info = how it works. */
  tone: "gain" | "loss" | "info";
}

const fmtDays = (d: number) => (d >= 60 ? `~${Math.round(d / 30)} months` : `~${Math.round(d)} days`);
const fmtAmt = (n: number) => Math.round(n).toLocaleString("en-US");

interface TokenLens {
  label: string;
  gate: number;
  balBefore: number;
  balAfter: number;
  holdBefore: AssetHold | null;
  holdAfter: AssetHold | null;
  added: number;
}

/**
 * Explain the before -> after move in holder language. Returns only the notes
 * the scenario actually triggered, gains/unlocks first.
 */
export function explainSimulation(
  before: ScoreInput,
  after: ScoreInput,
  knobs: SimKnobs,
  beforeResult: ScoreResult,
  afterResult: ScoreResult,
): SimNote[] {
  const gains: SimNote[] = [];
  const losses: SimNote[] = [];
  const infos: SimNote[] = [];
  const days = clampNonNeg(knobs.holdMoreDays);
  const capDays = C.duration.capMonths * 30;

  const tokens: TokenLens[] = [
    {
      label: "$RONKE",
      gate: C.gate.minRonke,
      balBefore: before.ronkeBalanceWhole,
      balAfter: after.ronkeBalanceWhole,
      holdBefore: before.ronkeHold,
      holdAfter: after.ronkeHold,
      added: clampNonNeg(knobs.addRonke),
    },
    {
      label: "RonkeStr",
      gate: C.gate.minRonkestr,
      balBefore: before.ronkestrBalanceWhole,
      balAfter: after.ronkestrBalanceWhole,
      holdBefore: before.ronkestrHold,
      holdAfter: after.ronkestrHold,
      added: clampNonNeg(knobs.addRonkestr),
    },
  ];
  const addedNfts = after.nftRarityFactors.length - before.nftRarityFactors.length;
  const nftLens: TokenLens = {
    label: "Ronkeverse",
    gate: C.gate.minNftCount,
    balBefore: before.nftRarityFactors.length,
    balAfter: after.nftRarityFactors.length,
    holdBefore: before.nftHold,
    holdAfter: after.nftHold,
    added: addedNfts,
  };

  for (const t of [...tokens, nftLens]) {
    const unit = t.label === "Ronkeverse" ? "NFT" : t.label;
    const gateLabel =
      t.label === "Ronkeverse" ? `${t.gate} Ronkeverse NFT` : `${fmtAmt(t.gate)} ${t.label}`;

    // First-time holder.
    if (t.balBefore <= 0 && t.balAfter > 0) {
      gains.push({
        emoji: "🌱",
        text: `You become a ${unit} holder - holding points start immediately, and your holding clock starts ticking today.`,
        tone: "gain",
      });
    }

    // Gate crossed: duration points switch on.
    const gatedBefore = t.balBefore >= t.gate && t.holdBefore != null;
    const gatedAfter = t.balAfter >= t.gate && t.holdAfter != null;
    if (!gatedBefore && gatedAfter) {
      gains.push({
        emoji: "🔓",
        text: `You crossed the ${gateLabel} minimum - your ${t.label} holding time now earns duration points.`,
        tone: "gain",
      });
    }

    // Still below the gate despite holding something.
    if (t.balAfter > 0 && t.balAfter < t.gate) {
      losses.push({
        emoji: "🔒",
        text: `You're still below the ${gateLabel} minimum, so your ${t.label} hold time earns nothing yet - ${fmtAmt(t.gate - t.balAfter)} more would unlock it.`,
        tone: "loss",
      });
    }

    // Weighted-age dilution from buying.
    if (t.added > 0 && t.holdBefore && t.holdBefore.durationDays >= 1 && t.balBefore > 0) {
      const diluted = dilutedDays(t.balBefore, t.holdBefore.durationDays, t.added);
      const drop = t.holdBefore.durationDays - diluted;
      if (drop >= 1 && drop / t.holdBefore.durationDays >= 0.05) {
        losses.push({
          emoji: "⚖️",
          text: `Buying more ${unit === "NFT" ? "NFTs" : t.label} pulls your holding clock toward the new ${unit === "NFT" ? "pieces" : "coins"}: your weighted ${t.label} age drops from ${fmtDays(t.holdBefore.durationDays)} to ${fmtDays(diluted)} before it starts growing again.`,
          tone: "loss",
        });
      }
    }

    // 24-month duration cap.
    if (gatedAfter && t.holdAfter) {
      const beforeCapped = (t.holdBefore?.durationDays ?? 0) >= capDays && gatedBefore;
      const afterCapped = t.holdAfter.durationDays >= capDays;
      if (afterCapped && !beforeCapped) {
        infos.push({
          emoji: "🏁",
          text: `Your ${t.label} holding time reaches the ${C.duration.capMonths}-month cap - duration points max out there (holding even longer keeps the points, but adds no more).`,
          tone: "info",
        });
      } else if (beforeCapped && days > 0) {
        infos.push({
          emoji: "🏁",
          text: `Your ${t.label} duration is already at the ${C.duration.capMonths}-month cap, so extra days add nothing there.`,
          tone: "info",
        });
      }
    }

    // Diamond-hands penalty on the duration that IS earning.
    if (gatedAfter && t.holdAfter && !t.holdAfter.neverSold) {
      const mult = t.holdAfter.everPaperSold ? C.diamond.everPaperSold : C.diamond.soldNotPaper;
      losses.push({
        emoji: "💎",
        text: `Your ${t.label} duration points are multiplied by ×${mult} because this wallet sold before - buying more can't restore that; only the clock keeps growing.`,
        tone: "loss",
      });
    }
  }

  // Collector set.
  const fullBefore =
    before.bodyTypesTotal > 0 && before.bodyTypesHeld >= before.bodyTypesTotal;
  const fullAfter = after.bodyTypesTotal > 0 && after.bodyTypesHeld >= after.bodyTypesTotal;
  if (!fullBefore && fullAfter) {
    gains.push({
      emoji: "🏆",
      text: `Full body set! Holding all ${after.bodyTypesTotal} body types adds the +${fmtAmt(C.collector.fullKicker)} collector kicker on top of +${C.collector.perType} per type.`,
      tone: "gain",
    });
  } else if (after.bodyTypesHeld > before.bodyTypesHeld) {
    const n = after.bodyTypesHeld - before.bodyTypesHeld;
    gains.push({
      emoji: "🧩",
      text: `${n} new body ${n === 1 ? "type" : "types"} adds +${fmtAmt(n * C.collector.perType)} collector points (${after.bodyTypesHeld}/${after.bodyTypesTotal} - completing the set adds a +${fmtAmt(C.collector.fullKicker)} kicker).`,
      tone: "gain",
    });
  }

  // 1/1 showpieces.
  if (after.oneOfOneCount > before.oneOfOneCount) {
    const n = after.oneOfOneCount - before.oneOfOneCount;
    gains.push({
      emoji: "🖼️",
      text: `Each 1/1 adds a flat +${C.oneOfOne.bonus} showpiece bonus on top of its rarity points - ${n === 1 ? "this one is" : `these ${n} are`} worth roughly a 40-common bulk buy.`,
      tone: "gain",
    });
  }

  // Diminishing-returns education, only when the relevant knob was touched.
  if (clampNonNeg(knobs.addRonke) > 0 || clampNonNeg(knobs.addRonkestr) > 0) {
    infos.push({
      emoji: "📉",
      text: "Token holding points use a log curve: every 10× of balance adds the same +150 points, so doubling a big bag moves the score less than doubling a small one.",
      tone: "info",
    });
  }
  if (addedNfts > 0) {
    infos.push({
      emoji: "📉",
      text: "NFT points grow sub-linearly - each extra piece adds a bit less than the last, so a mega-bag can't run away with the score.",
      tone: "info",
    });
  }
  if (days > 0 && afterResult.score > beforeResult.score) {
    infos.push({
      emoji: "⏳",
      text: `Duration compounds at ${C.duration.growthPerMonth}× per month (up to ${C.duration.capMonths} months), so patience pays more the longer you stay.`,
      tone: "info",
    });
  }

  return [...gains, ...losses, ...infos];
}

/** Convenience: run the whole simulation in one call. */
export function simulate(base: ScoreInput, knobs: SimKnobs) {
  const simInput = applyKnobs(base, knobs);
  const current = computeScore(base);
  const simulated = computeScore(simInput);
  return {
    input: simInput,
    current,
    simulated,
    notes: explainSimulation(base, simInput, knobs, current, simulated),
  };
}
