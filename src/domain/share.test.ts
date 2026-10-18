import { describe, expect, it } from "vitest";
import { decodeShare, encodeShare, shareFromHash, shareUrl } from "./share";
import type { Coupon, Selections } from "./types";
import { coupon } from "../test/factories";

const fx = coupon(13, (i) => ({ home: i === 0 ? "Atlético Madrid" : `Home ${i}`, league: "Spain · La Liga" }));
const c: Coupon = { kind: "MID13", id: "orig", title: "Midweek · 2026-W43", fixtures: fx, fetchedAt: "" };
const sel: Selections = Object.fromEntries(fx.map((f, i) => [f.id, i === 2 ? ["1", "X"] : ["2"]]));

describe("share links", () => {
  it("round-trips coupon, picks and unicode names", () => {
    const d = decodeShare(encodeShare(c, sel, [fx[1].id]));
    expect(d.coupon.kind).toBe("MID13");
    expect(d.coupon.title).toBe(c.title);
    expect(d.coupon.fixtures.map((f) => [f.home, f.away, f.kickoff, f.odds])).toEqual(fx.map((f) => [f.home, f.away, f.kickoff, f.odds]));
    expect(d.coupon.fixtures.every((f) => f.source === "import")).toBe(true);
    const picks = d.coupon.fixtures.map((f) => d.selections[f.id].join(""));
    expect(picks[2]).toBe("1X");
    expect(picks[0]).toBe("2");
    expect(d.excluded).toEqual([d.coupon.fixtures[1].id]);
  });

  it("produces URL-safe links and finds them in the hash", () => {
    const url = shareUrl("https://example.test/", c, sel);
    expect(url).toMatch(/^https:\/\/example\.test\/#slip=[A-Za-z0-9_-]+$/);
    const token = shareFromHash(new URL(url).hash)!;
    expect(decodeShare(token).coupon.fixtures).toHaveLength(13);
    expect(shareFromHash("#other=1")).toBeNull();
  });

  it("is deterministic so the same link maps to the same coupon id", () => {
    const t = encodeShare(c, sel);
    expect(decodeShare(t).coupon.id).toBe(decodeShare(t).coupon.id);
  });

  it("rejects damaged or mismatched links", () => {
    expect(() => decodeShare("not-base64!!")).toThrow(/damaged/);
    const t = encodeShare({ ...c, fixtures: fx.slice(0, 12) }, sel);
    expect(() => decodeShare(t)).toThrow(/13 fixtures/);
  });

  it("drops invalid pick characters", () => {
    const bad = { ...sel, [fx[0].id]: ["1", "Z", "1"] } as unknown as Selections;
    const d = decodeShare(encodeShare(c, bad));
    expect(d.selections[d.coupon.fixtures[0].id]).toEqual(["1"]);
  });
});
