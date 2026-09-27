import { describe, expect, it } from "vitest";
import { countdown, isCouponOpen, sampleCoupon, upcomingOnly, upcomingSlots } from "./fixtures";
import { simulateMatches, stateAt, ticketSurvival, outcomeOf } from "./simulator";
import { parseArchive, runBacktest, simulatedArchive } from "./backtest";
import { modelDrift, summarizeDrift } from "./drift";
import { impliedProbabilities, overround, predictability } from "./odds";
import { RULES } from "./jackpot";
import { fx, coupon } from "../test/factories";

describe("active date grounding", () => {
  const now = new Date("2026-09-27T12:00:00"); // a Sunday

  it("MJP sample kickoffs are all in the future on a weekend", () => {
    const c = sampleCoupon("MJP17", now);
    expect(c.fixtures).toHaveLength(17);
    expect(isCouponOpen(c, now)).toBe(true);
    for (const f of c.fixtures) expect([0, 6]).toContain(new Date(f.kickoff).getDay());
  });

  it("Midweek sample is 13 fixtures on Tuesday/Wednesday", () => {
    const c = sampleCoupon("MID13", now);
    expect(c.fixtures).toHaveLength(13);
    for (const f of c.fixtures) expect([2, 3]).toContain(new Date(f.kickoff).getDay());
    expect(new Set(c.fixtures.flatMap((f) => [f.home, f.away])).size).toBe(26);
  });

  it("rolls forward when this week's slot has passed", () => {
    const sat = new Date("2026-10-03T23:00:00");
    const slots = upcomingSlots("MJP17", sat);
    expect(slots[0].getTime()).toBeGreaterThan(sat.getTime());
  });

  it("is deterministic per week", () => {
    expect(sampleCoupon("MJP17", now).fixtures.map((f) => f.home)).toEqual(sampleCoupon("MJP17", new Date("2026-09-28T09:00:00")).fixtures.map((f) => f.home));
  });

  it("drops fixtures that have kicked off", () => {
    const past = fx({ kickoff: "2020-01-01T00:00:00Z" });
    const future = fx({ kickoff: "2099-01-01T00:00:00Z" });
    expect(upcomingOnly([past, future]).map((f) => f.id)).toEqual([future.id]);
    expect(isCouponOpen({ kind: "MID13", id: "x", title: "", fixtures: [past, future], fetchedAt: "" })).toBe(false);
  });

  it("formats countdowns", () => {
    const t = Date.parse("2026-01-01T00:00:00Z");
    expect(countdown("2026-01-02T01:02:03Z", t)).toBe("1d 01:02:03");
    expect(countdown("2026-01-01T00:10:00Z", t)).toBe("00:10:00");
    expect(countdown("2025-12-31T00:00:00Z", t)).toBe("Started");
  });
});

describe("odds maths", () => {
  it("removes the margin", () => {
    const odds = { home: 2, draw: 3.4, away: 3.6 };
    const p = impliedProbabilities(odds);
    expect(p["1"] + p.X + p["2"]).toBeCloseTo(1, 12);
    expect(overround(odds)).toBeGreaterThan(0);
  });
  it("predictability rises with a clear favourite", () => {
    expect(predictability({ home: 1.2, draw: 6, away: 12 })).toBeGreaterThan(predictability({ home: 2.7, draw: 3.1, away: 2.7 }));
  });
});

describe("matchday simulator", () => {
  const fixtures = coupon(13);
  it("is deterministic per seed and monotonic through the match", () => {
    const a = simulateMatches(fixtures, 42);
    expect(simulateMatches(fixtures, 42)).toEqual(a);
    const ht = stateAt(a, 45);
    const ft = stateAt(a, 90);
    ht.forEach((s, i) => {
      expect(ft[i].home).toBeGreaterThanOrEqual(s.home);
      expect(ft[i].away).toBeGreaterThanOrEqual(s.away);
    });
    expect(stateAt(a, 0).every((s) => s.home === 0 && s.away === 0 && s.outcome === "X")).toBe(true);
  });

  it("tracks survival across tiers", () => {
    const states = fixtures.map((f, i) => ({ fixtureId: f.id, home: i < 11 ? 1 : 0, away: 0, outcome: outcomeOf(i < 11 ? 1 : 0, 0) }));
    const sel = Object.fromEntries(fixtures.map((f) => [f.id, ["1" as const]]));
    const s = ticketSurvival(states, sel, [13]);
    expect(s.correct).toBe(11);
    expect(s.tierAlive).toBeNull();
    const mjp = ticketSurvival(states, sel, [17, 16, 15, 14, 13, 11]);
    expect(mjp.tierAlive).toBe(11);
  });
});

describe("backtesting", () => {
  it("runs every strategy over the simulated archive", () => {
    const archive = simulatedArchive("MJP17", 6, new Date("2026-09-27"));
    expect(archive.every((r) => r.provenance === "simulated")).toBe(true);
    const r = runBacktest(archive, "favorites");
    expect(r.rounds).toHaveLength(6);
    expect(r.hitRate).toBeGreaterThan(0);
    expect(r.hitRate).toBeLessThanOrEqual(1);
    expect(r.totalCost).toBe(6 * RULES.MJP17.stake);
  });

  it("marks imported archives as verified and validates them", () => {
    const f = coupon(13);
    const results = Object.fromEntries(f.map((x) => [x.id, "1"]));
    const rounds = parseArchive([{ kind: "MID13", id: "r1", fixtures: f, results, payouts: { 13: 1000 } }]);
    expect(rounds[0].provenance).toBe("verified");
    const bt = runBacktest(rounds, "favorites");
    expect(bt.rounds[0].tierHit).toBe(13);
    expect(bt.totalPayout).toBe(1000);
    expect(() => parseArchive([{ kind: "NOPE" }])).toThrow();
  });
});

describe("odds drift", () => {
  it("ends exactly at the current price", () => {
    const f = fx({ kickoff: new Date(Date.now() + 2 * 86_400_000).toISOString(), odds: { home: 2.2, draw: 3.1, away: 3.3 } });
    const series = modelDrift(f);
    expect(series.at(-1)!.odds).toEqual(f.odds);
    expect(series.at(-1)!.observed).toBe(true);
    const s = summarizeDrift(series);
    expect(s.current).toEqual(f.odds);
  });

  it("builds a full timeline even when kickoff is more than five days away", () => {
    const now = new Date("2026-09-27T12:00:00Z");
    const f = fx({ kickoff: "2026-10-04T14:00:00Z" });
    const series = modelDrift(f, now);
    expect(series).toHaveLength(24);
    expect(new Date(series[0].at).getTime()).toBeLessThan(now.getTime());
    expect(new Date(series.at(-1)!.at).getTime()).toBe(now.getTime());
  });
});
