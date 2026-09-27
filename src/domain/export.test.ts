import { describe, expect, it } from "vitest";
import { formatSms, formatTelegram, parseSms, toCsv, toJson } from "./export";
import { RULES } from "./jackpot";
import type { Coupon, Outcome, Selections } from "./types";
import { coupon } from "../test/factories";

const pattern: Outcome[] = ["1", "X", "2"];

describe("SportPesa SMS 79079 formatter", () => {
  const fixtures = coupon(17);
  const sel: Selections = Object.fromEntries(fixtures.map((f, i) => [f.id, [pattern[i % 3]]]));

  it("produces the exact MJP code for a single-line slip", () => {
    const r = formatSms(sel, fixtures, RULES.MJP17);
    expect(r.ok).toBe(true);
    expect(r.messages).toEqual(["MJP#1X21X21X21X21X21X"]);
  });

  it("uses the midweek prefix with 13 picks", () => {
    const f = coupon(13);
    const s: Selections = Object.fromEntries(f.map((x) => [x.id, ["1"]]));
    expect(formatSms(s, f, RULES.MID13).messages).toEqual(["JP#1111111111111"]);
  });

  it("expands doubles into one SMS per line", () => {
    const s = { ...sel, [fixtures[0].id]: ["1", "X"] as Outcome[], [fixtures[1].id]: ["X", "2"] as Outcome[] };
    const r = formatSms(s, fixtures, RULES.MJP17);
    expect(r.messages).toHaveLength(4);
    expect(r.messages.every((m) => /^MJP#[1X2]{17}$/.test(m))).toBe(true);
  });

  it("refuses to format an incomplete slip", () => {
    const s = { ...sel };
    delete s[fixtures[3].id];
    const r = formatSms(s, fixtures, RULES.MJP17);
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/Leg 4/);
  });

  it("validates hand-typed codes", () => {
    expect(parseSms("mjp#1x21x21x21x21x21x", RULES.MJP17).ok).toBe(true);
    expect(parseSms("MJP#1X2", RULES.MJP17).error).toMatch(/17 picks/);
    expect(parseSms("JP#1111111111111", RULES.MJP17).error).toMatch(/Prefix/);
    expect(parseSms("MJP#1X21X21X21X21X21A", RULES.MJP17).ok).toBe(false);
  });
});

describe("exports", () => {
  const fixtures = coupon(13, (i) => (i === 0 ? { home: 'Team "A", FC' } : {}));
  const c: Coupon = { kind: "MID13", id: "c1", title: "Midweek test", fixtures, fetchedAt: "2026-01-01T00:00:00Z" };
  const sel: Selections = Object.fromEntries(fixtures.map((f) => [f.id, ["1"]]));
  sel[fixtures[1].id] = ["1", "X"];

  it("telegram text has bold markdown, emoji and odds summary", () => {
    const t = formatTelegram(c, sel, RULES.MID13, "Syndicate");
    expect(t).toContain("🏆 *Midweek Jackpot* — Syndicate");
    expect(t).toContain("🔀 *2.*");
    expect(t).toMatch(/\*Lines:\* 2 · \*Stake:\* KES 198/);
  });

  it("JSON follows the coupon schema with totals", () => {
    const j = toJson(c, sel, RULES.MID13);
    expect(j.schema).toBe("sportspredicta.coupon/v1");
    expect(j.legs).toHaveLength(13);
    expect(j.totals).toEqual({ lines: 2, cost: 198, currency: "KES" });
  });

  it("CSV escapes quotes and commas", () => {
    const csv = toCsv(c, sel);
    const rows = csv.split("\n");
    expect(rows[0]).toBe("Leg,Home,Away,League,Kickoff,Odds 1,Odds X,Odds 2,Picks");
    expect(rows[1]).toContain('"Team ""A"", FC"');
    expect(rows[2].endsWith("1/X")).toBe(true);
  });
});
