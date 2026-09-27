import { describe, expect, it } from "vitest";
import { couponHealth } from "./health";
import { RULES } from "./jackpot";
import type { Selections } from "./types";
import { coupon } from "../test/factories";

describe("coupon health", () => {
  const fixtures = coupon(13, () => ({ odds: { home: 1.9, draw: 3.3, away: 4.0 } }));
  const favs: Selections = Object.fromEntries(fixtures.map((f) => [f.id, ["1"]]));

  it("scores a complete, valid favourites slip highly", () => {
    const h = couponHealth(favs, fixtures, RULES.MID13);
    expect(h.checks.find((c) => c.id === "rules")?.status).toBe("pass");
    expect(h.checks.find((c) => c.id === "complete")?.status).toBe("pass");
    expect(h.score).toBeGreaterThanOrEqual(90);
    expect(h.grade).toBe("A");
    expect(h.lines).toBe(1);
    expect(h.probability).toBeGreaterThan(0);
  });

  it("fails completeness and rules when legs are empty", () => {
    const sel = { ...favs };
    delete sel[fixtures[0].id];
    const h = couponHealth(sel, fixtures, RULES.MID13);
    expect(h.checks.find((c) => c.id === "complete")?.status).toBe("fail");
    expect(h.checks.find((c) => c.id === "rules")?.status).toBe("fail");
    expect(h.probability).toBe(0);
    expect(h.score).toBeLessThan(60);
  });

  it("warns when a single pick backs a slumping team", () => {
    const f = coupon(13, (i) => (i === 0 ? { homeForm: ["W", "L", "L", "L", "L"] } : {}));
    const sel: Selections = Object.fromEntries(f.map((x) => [x.id, ["1"]]));
    expect(couponHealth(sel, f, RULES.MID13).checks.find((c) => c.id === "slump")?.status).toBe("warn");
  });

  it("penalises heavy upset concentration", () => {
    const sel: Selections = Object.fromEntries(fixtures.map((f) => [f.id, ["2"]]));
    expect(couponHealth(sel, fixtures, RULES.MID13).checks.find((c) => c.id === "upsets")?.status).toBe("fail");
  });

  it("warns when a double is wasted on a heavy favourite", () => {
    const f = coupon(13, (i) => (i === 0 ? { odds: { home: 1.2, draw: 6, away: 12 } } : {}));
    const sel: Selections = Object.fromEntries(f.map((x) => [x.id, ["1"]]));
    sel[f[0].id] = ["1", "X"];
    expect(couponHealth(sel, f, RULES.MID13).checks.find((c) => c.id === "efficiency")?.status).toBe("warn");
  });
});
