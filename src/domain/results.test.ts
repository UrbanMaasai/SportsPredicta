import { describe, expect, it } from "vitest";
import { correctDistribution, gradeSlip, isSettled, parseResults, toHistoricalRound } from "./results";
import { RULES, combinations } from "./jackpot";
import { runBacktest } from "./backtest";
import type { Coupon, Outcome, Selections } from "./types";
import { coupon } from "../test/factories";

const all = (fixtures: { id: string }[], o: Outcome): Selections => Object.fromEntries(fixtures.map((f) => [f.id, [o]]));
const res = (fixtures: { id: string }[], code: string) => Object.fromEntries(fixtures.map((f, i) => [f.id, code[i] as Outcome]));

describe("slip grading", () => {
  const f17 = coupon(17);

  it("grades a single-line slip and finds the tier", () => {
    const results = res(f17, "11111111111111122"); // 15 homes then 2 aways
    const g = gradeSlip(all(f17, "1"), f17, results, RULES.MJP17);
    expect(g).toMatchObject({ decided: 17, total: 17, correct: 15, tierHit: 15 });
    expect(g.missed).toEqual([f17[15].id, f17[16].id]);
    expect(g.linesAtTier).toEqual({ 17: 0, 16: 0, 15: 1, 14: 1, 13: 1 });
  });

  it("counts lines per tier exactly for multi-pick slips", () => {
    const sel = all(f17, "1");
    sel[f17[0].id] = ["1", "X"]; // right pick + one wrong
    sel[f17[1].id] = ["X", "2"]; // both wrong
    sel[f17[2].id] = ["1", "X", "2"]; // one right
    const results = res(f17, "1".repeat(17));
    const dist = correctDistribution(sel, f17, results);
    expect(dist.reduce((a, b) => a + b, 0)).toBe(combinations(sel, f17));
    const g = gradeSlip(sel, f17, results, RULES.MJP17);
    expect(g.correct).toBe(16); // best line misses only leg 2
    // Brute force over all 2*2*3 = 12 lines.
    let at16 = 0;
    let at15 = 0;
    for (const a of sel[f17[0].id]) for (const b of sel[f17[1].id]) for (const c of sel[f17[2].id]) {
      const k = 14 + Number(a === "1") + Number(b === "1") + Number(c === "1");
      if (k >= 16) at16++;
      if (k >= 15) at15++;
    }
    expect(g.linesAtTier[16]).toBe(at16);
    expect(g.linesAtTier[15]).toBe(at15);
  });

  it("handles partially decided coupons", () => {
    const f13 = coupon(13);
    const g = gradeSlip(all(f13, "1"), f13, { [f13[0].id]: "1", [f13[1].id]: "2" }, RULES.MID13);
    expect(g).toMatchObject({ decided: 2, correct: 1, tierHit: null });
    expect(isSettled({ kind: "MID13", id: "c", title: "", fixtures: f13, fetchedAt: "" }, { [f13[0].id]: "1" })).toBe(false);
  });
});

describe("results parser", () => {
  const fx = coupon(4, (i) => ({ home: ["Arsenal", "Real Madrid", "Inter", "Lyon"][i], away: ["Chelsea", "Barcelona", "Roma", "Nice"][i] }));

  it("reads a compact code with prefix and separators", () => {
    const { results } = parseResults("MJP# 1 X 2-1", fx);
    expect(Object.values(results)).toEqual(["1", "X", "2", "1"]);
  });

  it("reads score lines in any order, including away team first", () => {
    const { results, unmatched } = parseResults("Inter 0-0 Roma\nArsenal vs Chelsea 2:1\nBarcelona 3-1 Real Madrid\nPSG 1-0 Lens", fx);
    expect(results[fx[0].id]).toBe("1");
    expect(results[fx[1].id]).toBe("2"); // Barcelona (away) won
    expect(results[fx[2].id]).toBe("X");
    expect(unmatched).toEqual(["PSG 1-0 Lens"]);
  });

  it("prefers the exact fixture over a fuzzy name match", () => {
    const tricky = coupon(2, (i) => ({ home: ["Real Sociedad", "Real Madrid"][i], away: ["Getafe", "Getafe B"][i] }));
    const { results } = parseResults("Real Madrid 2-0 Getafe B", tricky);
    expect(Object.keys(results)).toEqual([tricky[1].id]);
  });
});

describe("settled rounds in the backtester", () => {
  it("become entered-provenance rounds that pay entered prizes", () => {
    const f13 = coupon(13, () => ({ odds: { home: 1.5, draw: 4, away: 6 } }));
    const c: Coupon = { kind: "MID13", id: "r1", title: "R1", fixtures: f13, fetchedAt: "" };
    const round = toHistoricalRound(c, res(f13, "1".repeat(13)), { 13: 5000 });
    expect(round.provenance).toBe("entered");
    const bt = runBacktest([round], "favorites");
    expect(bt.rounds[0]).toMatchObject({ correct: 13, tierHit: 13, payout: 5000 });
  });
});
