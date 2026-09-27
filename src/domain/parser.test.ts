import { describe, expect, it } from "vitest";
import { parseCouponText, sanitizeRaw, toFixtures } from "./parser";

describe("raw text coupon parser", () => {
  it("parses numbered lines with vs, dash and dates", () => {
    const text = `Premier League
1. Arsenal vs Chelsea 04/10/2026 17:00 1.85 3.40 4.20
2) Inter - Roma\t2.10\t3.30\t3.50
Brighton v Fulham | 2.05 | 3.45 | 3.60`;
    const r = parseCouponText(text, new Date("2026-09-27T00:00:00Z"));
    expect(r).toHaveLength(3);
    expect(r[0]).toMatchObject({ home: "Arsenal", away: "Chelsea", league: "Premier League", odds: { home: 1.85, draw: 3.4, away: 4.2 } });
    expect(new Date(r[0].kickoff!).getDate()).toBe(4);
    expect(r[1]).toMatchObject({ home: "Inter", away: "Roma", odds: { home: 2.1, draw: 3.3, away: 3.5 } });
    expect(r[2]).toMatchObject({ home: "Brighton", away: "Fulham" });
  });

  it("does not mistake odds for dates", () => {
    const [f] = parseCouponText("Lyon vs Nice 1.12 6.50 9.00");
    expect(f.kickoff).toBeUndefined();
    expect(f.odds).toEqual({ home: 1.12, draw: 6.5, away: 9 });
  });

  it("skips lines without three odds or teams", () => {
    expect(parseCouponText("Arsenal vs Chelsea 1.85 3.40\nrandom 1.1 2.2 3.3")).toEqual([]);
  });

  it("converts raw fixtures into coupon fixtures with modelled form", () => {
    const raw = parseCouponText("A vs B 2.0 3.2 3.8\nC vs D 1.5 4.0 6.0");
    const fx = toFixtures(raw, "text", "cp", new Date("2030-01-01T12:00:00Z"));
    expect(fx.map((f) => f.leg)).toEqual([1, 2]);
    expect(fx[1].kickoff).toBe("2030-01-01T12:30:00.000Z");
    expect(fx.every((f) => f.formModelled && f.source === "text")).toBe(true);
  });

  it("sanitises AI output and drops malformed rows", () => {
    const r = sanitizeRaw([
      { home: "A", away: "B", odds: { home: "2.1", draw: 3.1, away: 3.4 }, homeForm: ["W", "Z", "L"] },
      { home: "C", away: "D", odds: { home: 0.5, draw: 3, away: 3 } },
      { home: 1, away: "E", odds: { home: 2, draw: 3, away: 4 } },
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].odds.home).toBe(2.1);
    expect(r[0].homeForm).toEqual(["W", "L"]);
    expect(sanitizeRaw("nope")).toEqual([]);
  });
});
