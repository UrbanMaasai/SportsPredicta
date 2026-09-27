import { describe, expect, it } from "vitest";
import { currentStreak, filterSlumps, inSlump, momentum, slumpSide, streakLabel, enrichFixture, modelForm } from "./form";
import { fx } from "../test/factories";

describe("streak detection", () => {
  it("finds the current run at the end of the form string", () => {
    expect(currentStreak(["W", "L", "D", "D"])).toEqual({ result: "D", length: 2 });
    expect(currentStreak(["L", "L", "L", "L", "L"])).toEqual({ result: "L", length: 5 });
    expect(currentStreak([])).toBeNull();
    expect(streakLabel(["W", "W", "W"])).toBe("W3");
  });

  it("flags 3+ consecutive losses as a slump", () => {
    expect(inSlump(["W", "L", "L", "L"])).toBe(true);
    expect(inSlump(["L", "L", "L", "W"])).toBe(false);
    expect(inSlump(["W", "D", "L", "L"])).toBe(false);
  });

  it("weights momentum toward recent results", () => {
    expect(momentum(["L", "L", "W", "W", "W"])).toBeGreaterThan(momentum(["W", "W", "W", "L", "L"]));
  });
});

describe("slump filtering", () => {
  const ok = fx({ homeForm: ["W", "W", "D", "W", "L"], awayForm: ["D", "D", "W", "L", "W"] });
  const homeSlump = fx({ homeForm: ["W", "D", "L", "L", "L"] });
  const awaySlump = fx({ awayForm: ["L", "L", "L", "L", "L"] });
  const both = fx({ homeForm: ["D", "L", "L", "L", "L"], awayForm: ["W", "L", "L", "L", "L"] });

  it("identifies which side is slumping", () => {
    expect(slumpSide(ok)).toBeNull();
    expect(slumpSide(homeSlump)).toBe("home");
    expect(slumpSide(awaySlump)).toBe("away");
    expect(slumpSide(both)).toBe("both");
  });

  it("keeps only slump-warning matches", () => {
    expect(filterSlumps([ok, homeSlump, awaySlump, both]).map((f) => f.id)).toEqual([homeSlump.id, awaySlump.id, both.id]);
  });
});

describe("form enrichment", () => {
  it("models form deterministically when the source omits it", () => {
    expect(modelForm("Arsenal", 0.6)).toEqual(modelForm("Arsenal", 0.6));
    const f = enrichFixture({ id: "x", leg: 1, home: "A", away: "B", league: "L", kickoff: "2030-01-01T00:00:00Z", odds: { home: 2, draw: 3, away: 4 }, source: "live" });
    expect(f.formModelled).toBe(true);
    expect(f.homeForm).toHaveLength(5);
    expect(f.h2h.length).toBeGreaterThan(0);
  });

  it("keeps supplied form and marks it as real", () => {
    const f = enrichFixture({ id: "x", leg: 1, home: "A", away: "B", league: "L", kickoff: "2030-01-01T00:00:00Z", odds: { home: 2, draw: 3, away: 4 }, source: "live", homeForm: ["L", "L", "L"], awayForm: ["W"] });
    expect(f.formModelled).toBe(false);
    expect(f.homeForm).toEqual(["L", "L", "L"]);
  });
});
