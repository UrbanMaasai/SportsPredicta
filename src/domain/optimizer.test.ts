import { describe, expect, it } from "vitest";
import { optimizeBudget } from "./optimizer";
import { RULES, combinations, validateSlip } from "./jackpot";
import { buildStrategy, modelProbabilities } from "./strategies";
import type { Outcome, Selections } from "./types";
import { coupon } from "../test/factories";

const oddsSet = [
  { home: 1.3, draw: 5.2, away: 9.5 },
  { home: 2.5, draw: 3.1, away: 2.9 },
  { home: 2.2, draw: 3.2, away: 3.3 },
  { home: 1.7, draw: 3.7, away: 5.0 },
  { home: 3.4, draw: 3.3, away: 2.1 },
];

describe("smart budget optimiser", () => {
  const fixtures = coupon(17, (i) => ({ odds: oddsSet[i % oddsSet.length] }));
  const base = buildStrategy("favorites", fixtures, 0);

  it("never exceeds the budget or the rules", () => {
    for (const budget of [99, 250, 400, 1000, 3200, 12_672, 50_000]) {
      const r = optimizeBudget(fixtures, base, RULES.MJP17, budget)!;
      expect(r.cost).toBeLessThanOrEqual(budget);
      expect(r.cost).toBe(combinations(r.selections, fixtures) * 99);
      expect(validateSlip(r.selections, fixtures, RULES.MJP17)).toEqual([]);
    }
  });

  it("returns null when the budget cannot cover one line", () => {
    expect(optimizeBudget(fixtures, base, RULES.MJP17, 50)).toBeNull();
  });

  it("doubles the least predictable legs first", () => {
    const r = optimizeBudget(fixtures, base, RULES.MJP17, 198)!;
    expect(r.lines).toBe(2);
    expect(r.doubles).toHaveLength(1);
    const chosen = fixtures.find((f) => f.id === r.doubles[0])!;
    expect(chosen.odds.home).not.toBe(1.3); // never the banker
    expect(r.lift).toBeGreaterThan(1);
  });

  it("matches brute force on a small coupon", () => {
    const small = coupon(5, (i) => ({ odds: oddsSet[i] }));
    const rules = { ...RULES.MID13, legs: 5 };
    const b = buildStrategy("favorites", small, 0);
    const budget = 99 * 4;
    const r = optimizeBudget(small, b, rules, budget)!;
    // enumerate every single/double assignment
    let best = 0;
    for (let mask = 0; mask < 1 << small.length; mask++) {
      const sel: Selections = {};
      small.forEach((f, i) => {
        const m = modelProbabilities(f);
        const second = (["1", "X", "2"] as Outcome[]).filter((o) => o !== b[f.id][0]).sort((x, y) => m[y] - m[x])[0];
        sel[f.id] = mask & (1 << i) ? [b[f.id][0], second] : [b[f.id][0]];
      });
      if (combinations(sel, small) * 99 > budget) continue;
      const p = small.reduce((acc, f) => acc * sel[f.id].reduce((s, o) => s + modelProbabilities(f)[o], 0), 1);
      best = Math.max(best, p);
    }
    expect(r.probability).toBeCloseTo(best, 10);
  });

  it("never uses triples on the midweek jackpot", () => {
    const f13 = coupon(13, (i) => ({ odds: oddsSet[i % oddsSet.length] }));
    const r = optimizeBudget(f13, buildStrategy("balanced", f13, 0), RULES.MID13, 99 * 128)!;
    expect(r.triples).toEqual([]);
    expect(Object.values(r.selections).every((p) => p.length <= 2)).toBe(true);
  });
});
