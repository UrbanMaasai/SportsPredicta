import { describe, expect, it } from "vitest";
import { MAX_PORTFOLIO_SLIPS, portfolioSummary, type PortfolioSlip } from "./portfolio";
import { RULES, expandLines } from "./jackpot";
import { modelProbabilities } from "./strategies";
import type { Outcome, Selections } from "./types";
import { coupon } from "../test/factories";

const fx = coupon(5, (i) => ({ odds: [{ home: 1.6, draw: 3.8, away: 5.5 }, { home: 2.5, draw: 3.1, away: 2.9 }, { home: 2.1, draw: 3.3, away: 3.4 }, { home: 3.2, draw: 3.2, away: 2.2 }, { home: 1.9, draw: 3.5, away: 4 }][i] }));
const rules = { ...RULES.MID13, legs: 5 };
const sel = (codes: string[]): Selections => Object.fromEntries(fx.map((f, i) => [f.id, [...codes[i]] as Outcome[]]));

const slips: PortfolioSlip[] = [
  { key: "a", name: "A", selections: sel(["1", "1X", "1", "2", "1"]) },
  { key: "b", name: "B", selections: sel(["1", "X2", "1", "X2", "1"]) },
  { key: "c", name: "C", selections: sel(["1", "1", "X", "2", "12"]) },
];

/** Brute force: every distinct line held, and the probability that one of them is the actual result. */
function brute(ps: PortfolioSlip[]) {
  const held = new Set<string>();
  for (const s of ps) for (const line of expandLines(s.selections, fx)) held.add(line.join(""));
  let p = 0;
  for (const line of held) p += [...line].reduce((acc, o, j) => acc * modelProbabilities(fx[j])[o as Outcome], 1);
  return { distinct: held.size, p };
}

describe("slip portfolio", () => {
  it("matches brute force for distinct lines and the chance any slip lands", () => {
    const s = portfolioSummary(slips, fx, rules);
    const b = brute(slips);
    expect(s.totalLines).toBe(2 + 4 + 2);
    expect(s.distinctLines).toBe(b.distinct);
    expect(s.duplicateLines).toBe(8 - b.distinct);
    expect(s.probability).toBeCloseTo(b.p, 12);
    expect(s.probability).toBeGreaterThanOrEqual(s.bestSingle - 1e-12);
    expect(s.totalCost).toBe(8 * 99);
  });

  it("identical slips are pure duplicates and add no probability", () => {
    const s = portfolioSummary([slips[0], { ...slips[0], key: "a2" }], fx, rules);
    expect(s.distinctLines).toBe(2);
    expect(s.duplicateLines).toBe(2);
    expect(s.probability).toBeCloseTo(s.bestSingle, 12);
  });

  it("reports per-leg counts, uncovered outcomes and a coverage ceiling", () => {
    const s = portfolioSummary(slips, fx, rules);
    expect(s.legs[0].counts).toEqual({ "1": 3, X: 0, "2": 0 });
    expect(s.legs[0].uncovered).toEqual(["X", "2"]);
    expect(s.legs[1].uncovered).toEqual([]);
    expect(s.legs[1].coverage).toBeCloseTo(1, 12);
    expect(s.probability).toBeLessThanOrEqual(s.ceiling + 1e-12);
  });

  it("handles an empty selection and refuses oversized portfolios", () => {
    expect(portfolioSummary([], fx, rules)).toMatchObject({ slips: 0, probability: 0, totalLines: 0 });
    const many = Array.from({ length: MAX_PORTFOLIO_SLIPS + 1 }, (_, i) => ({ ...slips[0], key: `k${i}` }));
    expect(() => portfolioSummary(many, fx, rules)).toThrow(/at most/);
  });
});
