import type { Fixture, Outcome, Selections } from "./types";
import type { JackpotRules } from "./jackpot";
import { combinations, sortOutcomes } from "./jackpot";
import { isDrawZone, oddsFor, predictability } from "./odds";
import { applyDoubles, buildStrategy, legsByUncertainty, modelProbabilities } from "./strategies";

export interface PortfolioTicket {
  id: "banker" | "draw" | "payout";
  name: string;
  purpose: string;
  selections: Selections;
  lines: number;
  cost: number;
  probability: number;
  /** Product of the best (highest) odds on each leg's picks — an indicator of payout skew. */
  oddsProduct: number;
}

function probability(sel: Selections, fixtures: Fixture[]): number {
  return fixtures.reduce((acc, f) => {
    const m = modelProbabilities(f);
    return acc * (sel[f.id] ?? []).reduce((s, o) => s + m[o], 0);
  }, 1);
}

function oddsProduct(sel: Selections, fixtures: Fixture[]): number {
  return fixtures.reduce((acc, f) => acc * Math.max(...(sel[f.id] ?? ["1"]).map((o) => oddsFor(f.odds, o))), 1);
}

function ticket(
  id: PortfolioTicket["id"],
  name: string,
  purpose: string,
  selections: Selections,
  fixtures: Fixture[],
  rules: JackpotRules,
): PortfolioTicket {
  const lines = combinations(selections, fixtures);
  return {
    id,
    name,
    purpose,
    selections,
    lines,
    cost: lines * rules.stake,
    probability: probability(selections, fixtures),
    oddsProduct: oddsProduct(selections, fixtures),
  };
}

/**
 * Three complementary tickets:
 * - Banker: favourites, doubles on the shakiest legs.
 * - Draw hedge: the banker with draw-zone and uncertain legs flipped to include X.
 * - High payout: contrarian value picks for top-heavy payouts.
 */
export function buildPortfolio(fixtures: Fixture[], rules: JackpotRules, doublesPerTicket = 3): PortfolioTicket[] {
  const d = Math.min(doublesPerTicket, rules.maxDoubles);
  const banker = buildStrategy("favorites", fixtures, d);

  const draw: Selections = {};
  const drawLegs = new Set(
    [...fixtures.filter((f) => isDrawZone(f.odds)), ...legsByUncertainty(fixtures)].slice(0, Math.max(d, 3)).map((f) => f.id),
  );
  for (const f of fixtures) {
    const b = banker[f.id];
    if (drawLegs.has(f.id) && !b.includes("X")) {
      draw[f.id] = sortOutcomes([b[0], "X"]);
    } else {
      draw[f.id] = [b[0]];
    }
  }
  const drawFixed = trimDoubles(draw, fixtures, rules.maxDoubles);

  const payout = applyDoubles(buildStrategy("bold", fixtures, 0), fixtures, Math.max(0, d - 1));

  return [
    ticket("banker", "Banker", "Favourites with doubles on the shakiest legs.", banker, fixtures, rules),
    ticket("draw", "Draw hedge", "Covers draw-zone and uncertain legs the banker leaves open.", drawFixed, fixtures, rules),
    ticket("payout", "High payout", "Contrarian value picks for top-heavy bonus payouts.", payout, fixtures, rules),
  ];
}

function trimDoubles(sel: Selections, fixtures: Fixture[], max: number): Selections {
  const out = { ...sel };
  const doubles = fixtures.filter((f) => out[f.id].length === 2).sort((a, b) => predictability(b.odds) - predictability(a.odds));
  while (doubles.length > max) {
    const f = doubles.shift()!;
    out[f.id] = [out[f.id][0]];
  }
  return out;
}

/** Exact probability that at least one ticket lands (inclusion–exclusion over independent legs). */
export function portfolioCoverage(tickets: { selections: Selections }[], fixtures: Fixture[]): number {
  const n = tickets.length;
  let total = 0;
  for (let mask = 1; mask < 1 << n; mask++) {
    const members = tickets.filter((_, i) => mask & (1 << i));
    const p = fixtures.reduce((acc, f) => {
      const m = modelProbabilities(f);
      const inter = (["1", "X", "2"] as Outcome[]).filter((o) => members.every((t) => (t.selections[f.id] ?? []).includes(o)));
      return acc * inter.reduce((s, o) => s + m[o], 0);
    }, 1);
    const bits = members.length;
    total += (bits % 2 === 1 ? 1 : -1) * p;
  }
  return total;
}
