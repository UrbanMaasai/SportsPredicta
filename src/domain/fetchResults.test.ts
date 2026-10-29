import { describe, expect, it } from "vitest";
import { applyFetchedResults } from "./results";
import { coupon } from "../test/factories";

const past = new Date(Date.now() - 86_400_000).toISOString();
const future = new Date(Date.now() + 86_400_000).toISOString();
const fx = coupon(4, (i) => ({ id: `r${i}`, kickoff: i < 3 ? past : future }));

describe("applying fetched results", () => {
  it("maps full-time scores to 1/X/2 by coupon position", () => {
    const got = applyFetchedResults(
      { matches: [
        { index: 0, homeGoals: 2, awayGoals: 1, status: "FT" },
        { index: 1, homeGoals: 1, awayGoals: 1, status: "ft" },
        { index: 2, homeGoals: 0, awayGoals: 3 },
      ] },
      fx,
      [13],
    );
    expect(got.results).toEqual({ r0: "1", r1: "X", r2: "2" });
    expect(got.unresolved).toBe(1);
  });

  it("ignores unfinished, malformed, out-of-range and not-yet-started fixtures", () => {
    const got = applyFetchedResults(
      { matches: [
        { index: 0, homeGoals: 1, awayGoals: 0, status: "postponed" },
        { index: 1, homeGoals: "2", awayGoals: 1 },
        { index: 2, homeGoals: 1.5, awayGoals: 0 },
        { index: 3, homeGoals: 1, awayGoals: 0, status: "FT" }, // kicks off tomorrow
        { index: 9, homeGoals: 1, awayGoals: 0 },
      ] },
      fx,
      [13],
    );
    expect(got.results).toEqual({});
    expect(got.unresolved).toBe(4);
  });

  it("keeps payouts only for this jackpot's tiers", () => {
    const got = applyFetchedResults({ matches: [], payouts: { "17": 0, "16": 1234567.4, "12": 99, "15": -5, "14": "x" } }, fx, [17, 16, 15, 14, 13]);
    expect(got.payouts).toEqual({ 17: 0, 16: 1234567 });
  });

  it("tolerates garbage input", () => {
    expect(applyFetchedResults(null, fx, [13])).toEqual({ results: {}, payouts: {}, unresolved: 4 });
    expect(applyFetchedResults({ matches: "nope" }, fx, [13]).results).toEqual({});
  });
});
