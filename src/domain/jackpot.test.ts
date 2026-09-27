import { describe, expect, it } from "vitest";
import {
  RULES,
  combinations,
  countByPicks,
  expandLines,
  targetTier,
  ticketCost,
  tierPlans,
  togglePick,
  validateSlip,
  DEFAULT_PRIZES,
} from "./jackpot";
import type { Outcome, Selections } from "./types";
import { coupon } from "../test/factories";

const singles = (ids: string[], o: Outcome = "1"): Selections => Object.fromEntries(ids.map((id) => [id, [o]]));

describe("permutation math", () => {
  const fixtures = coupon(17);
  const ids = fixtures.map((f) => f.id);

  it("all singles is one line costing one stake", () => {
    const sel = singles(ids);
    expect(combinations(sel, fixtures)).toBe(1);
    expect(ticketCost(1, RULES.MJP17)).toBe(99);
  });

  it("is the product of picks per leg", () => {
    const sel = singles(ids);
    sel[ids[0]] = ["1", "X"];
    sel[ids[1]] = ["1", "2"];
    sel[ids[2]] = ["1", "X", "2"];
    expect(combinations(sel, fixtures)).toBe(2 * 2 * 3);
    expect(ticketCost(12, RULES.MJP17)).toBe(1188);
  });

  it("seven doubles is 128 lines and KES 12,672", () => {
    const sel = singles(ids);
    ids.slice(0, 7).forEach((id) => (sel[id] = ["1", "X"]));
    const lines = combinations(sel, fixtures);
    expect(lines).toBe(128);
    expect(ticketCost(lines, RULES.MJP17)).toBe(12_672);
    expect(validateSlip(sel, fixtures, RULES.MJP17)).toEqual([]);
  });

  it("an empty leg yields zero lines", () => {
    const sel = singles(ids.slice(1));
    expect(combinations(sel, fixtures)).toBe(0);
  });

  it("expands every line of a multi-pick slip", () => {
    const small = coupon(3);
    const sel: Selections = { [small[0].id]: ["1", "X"], [small[1].id]: ["2"], [small[2].id]: ["1", "X", "2"] };
    const lines = expandLines(sel, small);
    expect(lines).toHaveLength(6);
    expect(new Set(lines.map((l) => l.join(""))).size).toBe(6);
    expect(lines[0]).toEqual(["1", "2", "1"]);
  });

  it("counts singles, doubles and triples", () => {
    const small = coupon(4);
    const sel: Selections = { [small[0].id]: ["1"], [small[1].id]: ["1", "X"], [small[2].id]: ["1", "X", "2"] };
    expect(countByPicks(sel, small)).toEqual({ singles: 1, doubles: 1, triples: 1, empty: 1 });
  });

  it("toggles picks and keeps them in 1-X-2 order", () => {
    let sel: Selections = { a: ["2"] };
    sel = togglePick(sel, "a", "1");
    expect(sel.a).toEqual(["1", "2"]);
    sel = togglePick(sel, "a", "2");
    expect(sel.a).toEqual(["1"]);
  });
});

describe("rule validation", () => {
  it("requires exactly 17 fixtures for MJP", () => {
    const f = coupon(16);
    const codes = validateSlip(singles(f.map((x) => x.id)), f, RULES.MJP17).map((i) => i.code);
    expect(codes).toContain("LEG_COUNT");
  });

  it("rejects an 8th double chance", () => {
    const f = coupon(17);
    const sel = singles(f.map((x) => x.id));
    f.slice(0, 8).forEach((x) => (sel[x.id] = ["1", "2"]));
    const codes = validateSlip(sel, f, RULES.MJP17).map((i) => i.code);
    expect(codes).toContain("MAX_DOUBLES");
    expect(codes).toContain("MAX_LINES");
  });

  it("forbids triple chance on the Midweek Jackpot", () => {
    const f = coupon(13);
    const sel = singles(f.map((x) => x.id));
    sel[f[0].id] = ["1", "X", "2"];
    const issues = validateSlip(sel, f, RULES.MID13);
    expect(issues.map((i) => i.code)).toContain("TRIPLE_FORBIDDEN");
  });

  it("allows double chance on the Midweek Jackpot", () => {
    const f = coupon(13);
    const sel = singles(f.map((x) => x.id));
    sel[f[0].id] = ["1", "X"];
    expect(validateSlip(sel, f, RULES.MID13)).toEqual([]);
  });

  it("flags empty legs", () => {
    const f = coupon(13);
    const sel = singles(f.slice(1).map((x) => x.id));
    expect(validateSlip(sel, f, RULES.MID13).map((i) => i.code)).toEqual(["EMPTY_LEG"]);
  });

  it("midweek is single-tier: exclusions are rejected", () => {
    const f = coupon(13);
    const codes = validateSlip(singles(f.map((x) => x.id)), f, RULES.MID13, [f[0].id]).map((i) => i.code);
    expect(codes).toContain("NO_SUB_TIERS");
  });

  it("MJP allows up to 4 exclusions (down to MJP 13)", () => {
    const f = coupon(17);
    const sel = singles(f.map((x) => x.id));
    expect(validateSlip(sel, f, RULES.MJP17, f.slice(0, 4).map((x) => x.id))).toEqual([]);
    expect(validateSlip(sel, f, RULES.MJP17, f.slice(0, 5).map((x) => x.id)).map((i) => i.code)).toContain("TOO_MANY_EXCLUDED");
  });
});

describe("sub-jackpot tiers", () => {
  it("excluding legs lowers the target tier", () => {
    expect(targetTier(RULES.MJP17, 0)).toBe(17);
    expect(targetTier(RULES.MJP17, 3)).toBe(14);
  });

  it("lists every MJP tier with its pool and leverage", () => {
    const plans = tierPlans(RULES.MJP17, DEFAULT_PRIZES.MJP17, 99);
    expect(plans.map((p) => p.tier)).toEqual([17, 16, 15, 14, 13]);
    expect(plans.map((p) => p.excludedCount)).toEqual([0, 1, 2, 3, 4]);
    expect(plans[0].leverage).toBeCloseTo(DEFAULT_PRIZES.MJP17.pools[17] / 99);
  });

  it("midweek has a single tier", () => {
    expect(tierPlans(RULES.MID13, DEFAULT_PRIZES.MID13, 99).map((p) => p.tier)).toEqual([13]);
  });
});
