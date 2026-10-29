import { describe, expect, it } from "vitest";
import { driftSeries, fixtureKey, modelDrift, pruneHistory, recordSnapshots } from "./drift";
import { fx } from "../test/factories";

const kickoff = "2026-10-04T14:00:00.000Z";

describe("observed odds history", () => {
  it("keys fixtures by teams and kickoff day, ignoring case and punctuation", () => {
    expect(fixtureKey({ home: "Man. City", away: "Brighton & HA", kickoff })).toBe(
      fixtureKey({ home: "man city", away: "BRIGHTON HA", kickoff: "2026-10-04T16:30:00Z" }),
    );
  });

  it("records real fixtures only and skips unchanged prices", () => {
    const live = fx({ source: "live", kickoff, odds: { home: 2.1, draw: 3.2, away: 3.5 } });
    const seed = fx({ source: "seed", kickoff });
    let h = recordSnapshots({}, [live, seed], new Date("2026-09-28T10:00:00Z"));
    expect(Object.keys(h)).toEqual([fixtureKey(live)]);
    h = recordSnapshots(h, [live], new Date("2026-09-29T10:00:00Z"));
    expect(h[fixtureKey(live)].snapshots).toHaveLength(1);
    h = recordSnapshots(h, [{ ...live, id: "other-import", odds: { home: 1.95, draw: 3.3, away: 3.9 } }], new Date("2026-09-30T10:00:00Z"));
    expect(h[fixtureKey(live)].snapshots.map((s) => s.odds.home)).toEqual([2.1, 1.95]);
  });

  it("prunes fixtures that kicked off over a week ago", () => {
    const h = {
      old: { kickoff: "2026-09-01T12:00:00Z", snapshots: [] },
      soon: { kickoff, snapshots: [] },
    };
    expect(Object.keys(pruneHistory(h, new Date("2026-09-27T12:00:00Z")))).toEqual(["soon"]);
  });
});

describe("drift series", () => {
  const now = new Date("2026-10-01T12:00:00Z");
  const f = fx({ source: "live", kickoff, odds: { home: 1.95, draw: 3.3, away: 3.9 } });

  it("is fully modelled without observations", () => {
    expect(driftSeries(f, [], now)).toEqual(modelDrift(f, now));
  });

  it("uses observed prices and bridges the modelled path onto the first one", () => {
    const observed = [
      { at: "2026-09-30T10:00:00.000Z", odds: { home: 1.95, draw: 3.3, away: 3.9 }, observed: true },
      { at: "2026-09-28T10:00:00.000Z", odds: { home: 2.1, draw: 3.2, away: 3.5 }, observed: true },
    ];
    const s = driftSeries(f, observed, now);
    const firstObs = s.findIndex((p) => p.at === "2026-09-28T10:00:00.000Z");
    expect(firstObs).toBeGreaterThan(0);
    expect(s.slice(0, firstObs).every((p) => !p.observed && p.at < "2026-09-28T10:00:00.000Z")).toBe(true);
    // the modelled bridge lands next to the first observed price, not the current one
    expect(Math.abs(s[firstObs - 1].odds.home - 2.1)).toBeLessThan(0.25);
    expect(s.at(-1)!.odds).toEqual(f.odds);
    expect(s.filter((p) => p.observed)).toHaveLength(2);
  });

  it("appends the current price when it differs from the last observation", () => {
    const observed = [{ at: "2026-09-28T10:00:00.000Z", odds: { home: 2.1, draw: 3.2, away: 3.5 }, observed: true }];
    const s = driftSeries(f, observed, now);
    expect(s.at(-1)).toEqual({ at: now.toISOString(), odds: f.odds, observed: true });
  });
});
