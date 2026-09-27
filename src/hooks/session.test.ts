import { describe, expect, it } from "vitest";
import { restoreSession } from "./useJackpot";
import { sampleCoupon } from "../domain/fixtures";
import type { Session } from "../lib/storage";
import { mergeSlips } from "../lib/storage";
import type { Slip } from "../domain/types";

describe("session restoration", () => {
  const now = new Date("2026-09-27T10:00:00");

  it("starts fresh with upcoming sample coupons when nothing is saved", () => {
    const s = restoreSession(null, now);
    expect(s.restored).toBe(false);
    expect(s.kind).toBe("MJP17");
    expect(s.byKind.MJP17!.coupon.fixtures).toHaveLength(17);
    expect(s.byKind.MID13!.coupon.fixtures).toHaveLength(13);
  });

  it("keeps an open coupon and its selections", () => {
    const coupon = sampleCoupon("MID13", now);
    const saved: Session = {
      kind: "MID13",
      view: "consensus",
      savedAt: now.toISOString(),
      byKind: { MID13: { coupon, selections: { [coupon.fixtures[0].id]: ["X"] }, excluded: [], strategy: "custom", doubles: 0 } },
    };
    const s = restoreSession(saved, now);
    expect(s.kind).toBe("MID13");
    expect(s.view).toBe("consensus");
    expect(s.byKind.MID13!.selections[coupon.fixtures[0].id]).toEqual(["X"]);
    expect(s.replaced).toEqual([]);
  });

  it("replaces a coupon that has already kicked off", () => {
    const old = sampleCoupon("MJP17", new Date("2026-08-01T10:00:00"));
    const saved: Session = {
      kind: "MJP17",
      view: "coupon",
      savedAt: "",
      byKind: { MJP17: { coupon: old, selections: {}, excluded: [], strategy: "bold", doubles: 0 } },
    };
    const s = restoreSession(saved, now);
    expect(s.replaced).toEqual(["MJP17"]);
    expect(s.byKind.MJP17!.coupon.id).not.toBe(old.id);
    expect(s.byKind.MJP17!.coupon.fixtures.every((f) => new Date(f.kickoff) > now)).toBe(true);
  });
});

describe("slip merge", () => {
  const slip = (id: string, updatedAt: string): Slip => ({
    id, updatedAt, createdAt: updatedAt, kind: "MJP17", couponId: "c", name: id, strategy: "favorites", selections: {}, excluded: [],
  });
  it("keeps the newest copy and sorts newest first", () => {
    const merged = mergeSlips([slip("a", "2026-01-01"), slip("b", "2026-01-03")], [slip("a", "2026-01-05")]);
    expect(merged.map((s) => [s.id, s.updatedAt])).toEqual([["a", "2026-01-05"], ["b", "2026-01-03"]]);
  });
});
