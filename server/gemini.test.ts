// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const calls: string[] = [];
let reply: (model: string) => unknown;

vi.mock("@google/genai", async (orig) => {
  const real = await orig<typeof import("@google/genai")>();
  class GoogleGenAI {
    models = {
      generateContent: async ({ model }: { model: string }) => {
        calls.push(model);
        return reply(model);
      },
    };
  }
  return { ...real, GoogleGenAI };
});

beforeEach(() => {
  calls.length = 0;
  process.env.GEMINI_API_KEY = "test-key";
});
afterEach(() => {
  delete process.env.GEMINI_API_KEY;
});

const now = new Date("2026-11-01T09:00:00+03:00");

describe("live search against realistic grounded output", () => {
  it("falls back when the configured model is retired, and recovers the coupon from messy prose", async () => {
    // What a grounded answer really looks like: prose, citations, no odds, a guessed year, one stale match.
    const text = [
      "Here is this weekend's SportPesa Mega Jackpot Pro coupon [1][2]:",
      "```json",
      JSON.stringify([
        { home: "Arsenal", away: "Chelsea", league: "England · Premier League", kickoff: "2025-11-08T15:00:00" },
        { home: "Inter", away: "Roma", kickoff: "2026-11-08T17:00:00+03:00", odds: { home: 2.1, draw: 3.3, away: 3.5 } },
        { home: "Old", away: "Match", kickoff: "2026-10-01T15:00:00+03:00" },
      ]),
      "```",
      "Odds were not listed for most matches [3].",
    ].join("\n");
    reply = (model) => {
      if (model === "gemini-2.5-flash") throw Object.assign(new Error("models/gemini-2.5-flash is not found for API version v1beta"), { status: 404 });
      return { text, candidates: [{ groundingMetadata: { groundingChunks: [{ web: { uri: "https://www.ke.sportpesa.com/jackpots", title: "SportPesa" } }] } }] };
    };
    const { scrapeLive } = await import("./gemini");
    const r = await scrapeLive("MJP17", now);
    expect(calls).toEqual(["gemini-2.5-flash", "gemini-flash-latest"]);
    expect(r.fixtures.map((f) => f.home)).toEqual(["Arsenal", "Inter"]); // past match dropped
    expect(r.fixtures[0]).toMatchObject({ kickoff: "2026-11-08T12:00:00.000Z", odds: undefined }); // year + timezone fixed, no invented odds
    expect(r.fixtures[1].odds).toEqual({ home: 2.1, draw: 3.3, away: 3.5 });
    expect(r.sources[0].uri).toContain("sportpesa");
  });

  it("does not retry on other errors (e.g. a bad API key)", async () => {
    reply = () => {
      throw Object.assign(new Error("API key not valid"), { status: 400 });
    };
    const { scrapeLive } = await import("./gemini");
    await expect(scrapeLive("MID13", now)).rejects.toThrow(/API key not valid/);
    expect(calls).toHaveLength(1);
  });
});

describe("screenshot reading against realistic output", () => {
  it("keeps every visible row of a jackpot screenshot with no odds", async () => {
    reply = () => ({
      text: JSON.stringify([
        { home: "Leeds", away: "Stoke City", league: "Championship", kickoff: "2026-11-08T15:00:00" },
        { home: "Lens", away: "Monaco", kickoff: "2026-11-09T19:30:00", odds: null },
        { home: "Ajax", away: "PSV", kickoff: "2026-11-09T21:00:00+03:00", odds: { home: 0, draw: 0, away: 0 } },
      ]),
    });
    const { ocrCoupon } = await import("./gemini");
    const r = await ocrCoupon("iVBORw0KGgo=", "image/png", now);
    expect(r.map((f) => [f.home, f.away, f.kickoff, f.odds])).toEqual([
      ["Leeds", "Stoke City", "2026-11-08T12:00:00.000Z", undefined],
      ["Lens", "Monaco", "2026-11-09T16:30:00.000Z", undefined],
      ["Ajax", "PSV", "2026-11-09T18:00:00.000Z", undefined],
    ]);
  });
});
