import { describe, expect, it } from "vitest";
import { applyLookedUpOdds, mergeRaw, NEUTRAL_ODDS, normalizeKickoff, parseCouponText, sanitizeRaw, toFixtures } from "./parser";
import { buildCoupon } from "../components/modals/ImportModal";
import { formatTelegram, toCsv, toJson } from "./export";
import { RULES } from "./jackpot";
import type { Coupon } from "./types";

const now = new Date("2026-11-01T09:00:00+03:00");
const row = (i: number, extra: Record<string, unknown> = {}) => ({ home: `Home ${i}`, away: `Away ${i}`, kickoff: "2026-11-08T15:00:00+03:00", ...extra });

describe("realistic jackpot imports (regressions)", () => {
  it("keeps fixtures from a coupon that prints no odds, without inventing any", () => {
    const r = sanitizeRaw([row(1, { odds: { home: 0, draw: 0, away: 0 } }), row(2, { odds: null }), row(3)], now);
    expect(r).toHaveLength(3);
    expect(r.every((f) => f.odds === undefined)).toBe(true);
  });

  it("two screenshots of a long coupon merge into all 17 (overlap removed)", () => {
    const top = sanitizeRaw(Array.from({ length: 9 }, (_, i) => row(i)), now);
    const bottom = sanitizeRaw(Array.from({ length: 9 }, (_, i) => row(i + 8)), now); // row 8 appears in both
    const merged = mergeRaw(top, bottom);
    expect(merged).toHaveLength(17);
    expect(buildCoupon("MJP17", merged, "ocr", now).coupon?.fixtures).toHaveLength(17);
  });

  it("reads a kickoff with no timezone as Nairobi time", () => {
    expect(normalizeKickoff("2026-11-08T15:00:00", now)).toBe("2026-11-08T12:00:00.000Z");
    expect(normalizeKickoff("2026-11-08 15:00", now)).toBe("2026-11-08T12:00:00.000Z");
    expect(normalizeKickoff("2026-11-08T15:00:00Z", now)).toBe("2026-11-08T15:00:00.000Z");
  });

  it("repairs a wrong year but leaves genuinely old fixtures alone", () => {
    expect(normalizeKickoff("2025-11-08T15:00:00+03:00", now)).toBe("2026-11-08T12:00:00.000Z");
    // Late-December coupon read with this year for a January match → next year.
    expect(normalizeKickoff("2026-01-03T15:00:00+03:00", new Date("2026-12-30T10:00:00+03:00"))).toBe("2027-01-03T12:00:00.000Z");
    // A fixture from two months ago is really past: unchanged (and later dropped as kicked off).
    expect(normalizeKickoff("2026-09-01T15:00:00+03:00", now)).toBe("2026-09-01T12:00:00.000Z");
    expect(normalizeKickoff("next Saturday", now)).toBeUndefined();
  });

  it("whole coupon read with last year's dates now loads", () => {
    const lastYear = Array.from({ length: 17 }, (_, i) => row(i, { kickoff: "2025-11-08T15:00:00+03:00" }));
    expect(buildCoupon("MJP17", sanitizeRaw(lastYear, now), "ocr", now).coupon).not.toBeNull();
  });
});

describe("merging reads", () => {
  it("lets a later read fill odds, kickoff and league the first one lacked", () => {
    const a = [{ home: "Arsenal", away: "Chelsea" }];
    const b = [{ home: "ARSENAL", away: "chelsea", kickoff: "2026-11-08T12:00:00.000Z", league: "EPL", odds: { home: 2, draw: 3, away: 4 } }];
    expect(mergeRaw(a, b)).toEqual([{ home: "Arsenal", away: "Chelsea", kickoff: "2026-11-08T12:00:00.000Z", league: "EPL", odds: { home: 2, draw: 3, away: 4 } }]);
  });
});

describe("pasted coupons without odds", () => {
  it("accepts numbered or dated fixture lines and keeps league headings as headings", () => {
    const text = "England - Premier League\n1. Arsenal vs Chelsea 08/11 17:00\n2 Inter - Roma\nSpain\nReal Madrid v Sevilla 09/11 21:00 1.40 4.80 7.50";
    const r = parseCouponText(text, now);
    expect(r.map((f) => [f.home, f.away, Boolean(f.odds)])).toEqual([
      ["Arsenal", "Chelsea", false],
      ["Inter", "Roma", false],
      ["Real Madrid", "Sevilla", true],
    ]);
    expect(r[0].league).toBe("England - Premier League");
    expect(r[2].league).toBe("Spain");
  });
});

describe("fixtures without odds", () => {
  const fx = toFixtures(sanitizeRaw([row(1), row(2, { odds: { home: 1.9, draw: 3.3, away: 4.1 } })], now), "ocr", "c", now);

  it("are flagged and given neutral placeholder prices", () => {
    expect(fx[0]).toMatchObject({ oddsMissing: true, odds: NEUTRAL_ODDS });
    expect(fx[1].oddsMissing).toBeUndefined();
  });

  it("market odds fill only the missing ones, with plausible prices", () => {
    const raw = sanitizeRaw([row(1), row(2), row(3, { odds: { home: 1.9, draw: 3.3, away: 4.1 } })], now);
    const { raw: next, filled } = applyLookedUpOdds(raw, [0, 1, 2], {
      odds: [
        { index: 0, home: 2.05, draw: 3.2, away: 3.6, bookmaker: "SportPesa" },
        { index: 1, home: 0.9, draw: 3, away: 3 }, // implausible
        { index: 2, home: 9, draw: 9, away: 9 }, // already had odds
      ],
    });
    expect(filled).toBe(1);
    expect(next[0].odds).toEqual({ home: 2.05, draw: 3.2, away: 3.6 });
    expect(next[1].odds).toBeUndefined();
    expect(next[2].odds).toEqual({ home: 1.9, draw: 3.3, away: 4.1 });
  });

  it("never appear as real odds in exports", () => {
    const thirteen = toFixtures(sanitizeRaw(Array.from({ length: 13 }, (_, i) => row(i)), now), "ocr", "c13", now);
    const c: Coupon = { kind: "MID13", id: "c13", title: "T", fixtures: thirteen, fetchedAt: "" };
    const sel = Object.fromEntries(thirteen.map((f) => [f.id, ["1" as const]]));
    expect(formatTelegram(c, sel, RULES.MID13)).toContain("(no odds)");
    expect(toCsv(c, sel).split("\n")[1]).toMatch(/,,,1$/);
    expect(toJson(c, sel, RULES.MID13).legs[0].odds).toBeNull();
  });
});
