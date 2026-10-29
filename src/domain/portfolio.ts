import type { Fixture, Outcome, Selections } from "./types";
import type { JackpotRules } from "./jackpot";
import { combinations } from "./jackpot";
import { modelProbabilities } from "./strategies";

/** Inclusion–exclusion over subsets is exact but exponential; beyond this many slips it is refused. */
export const MAX_PORTFOLIO_SLIPS = 12;

export interface PortfolioSlip {
  key: string;
  name: string;
  selections: Selections;
}

export interface LegCoverage {
  fixture: Fixture;
  /** How many selected slips include each outcome on this leg. */
  counts: Record<Outcome, number>;
  /** Outcomes no slip covers — if one of these happens, every ticket in the portfolio loses. */
  uncovered: Outcome[];
  /** Model probability that the leg's result is covered by at least one slip. */
  coverage: number;
}

export interface PortfolioSummary {
  slips: number;
  totalLines: number;
  /** Distinct lines across all slips; the rest are duplicates that pay the same line twice. */
  distinctLines: number;
  duplicateLines: number;
  totalCost: number;
  /** Probability that at least one line in the portfolio is fully correct. */
  probability: number;
  /** Best single slip's probability, for comparison. */
  bestSingle: number;
  legs: LegCoverage[];
  /** Product of per-leg coverage: an upper bound — the portfolio can never beat covering every leg's result. */
  ceiling: number;
}

const OUTS: Outcome[] = ["1", "X", "2"];

/**
 * Inclusion–exclusion over every non-empty subset S of slips. The lines common to all slips in S
 * are, per leg, the intersection of their picks, so both the count and the model probability of
 * the intersection factorise over legs.
 */
function inclusionExclusion(slips: PortfolioSlip[], fixtures: Fixture[]): { probability: number; distinct: number } {
  const probs = fixtures.map((f) => modelProbabilities(f));
  let probability = 0;
  let distinct = 0;
  const n = slips.length;
  for (let mask = 1; mask < 1 << n; mask++) {
    const members = slips.filter((_, i) => mask & (1 << i));
    let p = 1;
    let count = 1;
    for (let j = 0; j < fixtures.length && count > 0; j++) {
      const id = fixtures[j].id;
      const common = OUTS.filter((o) => members.every((s) => (s.selections[id] ?? []).includes(o)));
      count *= common.length;
      p *= common.reduce((acc, o) => acc + probs[j][o], 0);
    }
    const sign = members.length % 2 === 1 ? 1 : -1;
    probability += sign * (count > 0 ? p : 0);
    distinct += sign * count;
  }
  return { probability, distinct };
}

export function portfolioSummary(slips: PortfolioSlip[], fixtures: Fixture[], rules: JackpotRules): PortfolioSummary {
  if (slips.length > MAX_PORTFOLIO_SLIPS) throw new Error(`Select at most ${MAX_PORTFOLIO_SLIPS} slips.`);
  const lines = slips.map((s) => combinations(s.selections, fixtures));
  const totalLines = lines.reduce((a, b) => a + b, 0);
  const { probability, distinct } = slips.length ? inclusionExclusion(slips, fixtures) : { probability: 0, distinct: 0 };
  const single = (s: PortfolioSlip) =>
    fixtures.reduce((acc, f) => acc * (s.selections[f.id] ?? []).reduce((x, o) => x + modelProbabilities(f)[o], 0), 1);
  const legs = fixtures.map((f) => {
    const counts = { "1": 0, X: 0, "2": 0 } as Record<Outcome, number>;
    for (const s of slips) for (const o of s.selections[f.id] ?? []) counts[o]++;
    const m = modelProbabilities(f);
    return {
      fixture: f,
      counts,
      uncovered: OUTS.filter((o) => counts[o] === 0),
      coverage: OUTS.filter((o) => counts[o] > 0).reduce((acc, o) => acc + m[o], 0),
    };
  });
  return {
    slips: slips.length,
    totalLines,
    distinctLines: distinct,
    duplicateLines: totalLines - distinct,
    totalCost: totalLines * rules.stake,
    probability: Math.max(0, probability),
    bestSingle: slips.length ? Math.max(...slips.map(single)) : 0,
    legs,
    ceiling: slips.length ? legs.reduce((acc, l) => acc * l.coverage, 1) : 0,
  };
}
