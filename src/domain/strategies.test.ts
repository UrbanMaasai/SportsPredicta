import { describe, expect, it } from "vitest";
import { applyDoubles, buildStrategy, compareStrategies, consensus, pickBalanced, pickBold, pickFavorite } from "./strategies";
import { buildPortfolio, portfolioCoverage } from "./hedging";
import { RULES, countByPicks, validateSlip } from "./jackpot";
import { coupon, fx } from "../test/factories";
import type { Outcome } from "./types";

describe("strategies", () => {
  it("favorites picks the lowest price", () => {
    expect(pickFavorite(fx({ odds: { home: 3.5, draw: 3.3, away: 2.1 } }))).toBe("2");
    expect(pickFavorite(fx({ odds: { home: 1.4, draw: 4.5, away: 7 } }))).toBe("1");
  });

  it("balanced keeps strong favourites and takes draws in the draw zone", () => {
    expect(pickBalanced(fx({ odds: { home: 1.45, draw: 4.4, away: 6.5 } }))).toBe("1");
    const drawy = fx({ odds: { home: 2.6, draw: 3.0, away: 2.8 }, homeForm: ["D", "D", "W", "D", "L"], awayForm: ["D", "L", "D", "W", "D"] });
    expect(pickBalanced(drawy)).toBe("X");
  });

  it("bold goes against a fragile favourite", () => {
    const f = fx({ odds: { home: 2.4, draw: 3.2, away: 2.9 }, homeForm: ["W", "L", "L", "L", "L"], awayForm: ["L", "W", "W", "W", "W"] });
    expect(pickBold(f)).not.toBe("1");
  });

  it("applies doubles to the least predictable legs", () => {
    const fixtures = coupon(17, (i) => ({ odds: i === 5 ? { home: 2.7, draw: 3.1, away: 2.7 } : { home: 1.3, draw: 5, away: 9 } }));
    const sel = applyDoubles(buildStrategy("favorites", fixtures, 0), fixtures, 1);
    expect(sel[fixtures[5].id]).toHaveLength(2);
    expect(countByPicks(sel, fixtures).doubles).toBe(1);
  });

  it("every strategy yields a valid slip for both jackpots", () => {
    for (const kind of ["MJP17", "MID13"] as const) {
      const fixtures = coupon(RULES[kind].legs);
      for (const s of ["favorites", "balanced", "bold"] as const) {
        expect(validateSlip(buildStrategy(s, fixtures, 3), fixtures, RULES[kind])).toEqual([]);
      }
    }
  });

  it("comparison flags disagreements with a hedge", () => {
    const rows = compareStrategies(coupon(5));
    for (const r of rows) {
      expect(r.agree).toBe(r.conservative === r.bold);
      if (!r.agree) expect(r.hedge).toHaveLength(2);
    }
  });

  it("consensus assigns agreement tiers and bounded confidence", () => {
    const rows = consensus([fx({ odds: { home: 1.2, draw: 6.5, away: 13 } }), fx({ odds: { home: 2.6, draw: 3.0, away: 2.7 } })]);
    expect(rows[0].tier).toBe("Unanimous");
    expect(rows[0].pick).toBe("1");
    for (const r of rows) {
      expect(r.confidence).toBeGreaterThan(0);
      expect(r.confidence).toBeLessThanOrEqual(1);
    }
  });
});

describe("hedging portfolio", () => {
  const fixtures = coupon(13, (i) => ({ odds: [{ home: 1.5, draw: 4, away: 6 }, { home: 2.5, draw: 3.05, away: 2.9 }, { home: 2.1, draw: 3.3, away: 3.4 }][i % 3] }));

  it("builds three valid, distinct tickets", () => {
    const t = buildPortfolio(fixtures, RULES.MID13, 3);
    expect(t.map((x) => x.id)).toEqual(["banker", "draw", "payout"]);
    for (const x of t) expect(validateSlip(x.selections, fixtures, RULES.MID13)).toEqual([]);
    expect(JSON.stringify(t[0].selections)).not.toBe(JSON.stringify(t[2].selections));
  });

  it("coverage by inclusion–exclusion is at least the best single ticket and at most their sum", () => {
    const t = buildPortfolio(fixtures, RULES.MID13, 3);
    const cover = portfolioCoverage(t, fixtures);
    expect(cover).toBeGreaterThanOrEqual(Math.max(...t.map((x) => x.probability)) - 1e-12);
    expect(cover).toBeLessThanOrEqual(t.reduce((s, x) => s + x.probability, 0) + 1e-12);
  });

  it("coverage of identical tickets equals one ticket", () => {
    const sel = Object.fromEntries(fixtures.map((f) => [f.id, ["1"] as Outcome[]]));
    const one = portfolioCoverage([{ selections: sel }], fixtures);
    expect(portfolioCoverage([{ selections: sel }, { selections: sel }], fixtures)).toBeCloseTo(one, 12);
  });
});
