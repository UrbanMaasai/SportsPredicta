// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createApi, type ApiDeps } from "./app";
import { securityHeaders, TtlCache, withTimeout, TimeoutError } from "./guard";

let server: Server | null = null;
afterEach(() => {
  server?.close();
  server = null;
});

async function start(deps: Partial<ApiDeps>) {
  const app = express();
  app.use(securityHeaders);
  app.use("/api", createApi(deps));
  server = app.listen(0);
  await new Promise((r) => server!.once("listening", r));
  const base = `http://127.0.0.1:${(server!.address() as AddressInfo).port}/api`;
  return (path: string, body: unknown) =>
    fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

const fixtures = [{ home: "A", away: "B", odds: { home: 2, draw: 3, away: 4 } }];

describe("API protection", () => {
  it("rate-limits fixture endpoints per client with Retry-After", async () => {
    const post = await start({ rateLimitPerMinute: 2 });
    expect((await post("/fixtures/parse", { text: "A vs B 2.0 3.0 4.0" })).status).toBe(200);
    expect((await post("/fixtures/parse", { text: "A vs B 2.0 3.0 4.0" })).status).toBe(200);
    const blocked = await post("/fixtures/parse", { text: "A vs B 2.0 3.0 4.0" });
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
  });

  it("caches live searches per jackpot and refreshes on request", async () => {
    const scrapeLive = vi.fn(async () => ({ fixtures, sources: [] }));
    const post = await start({ scrapeLive, rateLimitPerMinute: 100 });
    const first = await post("/fixtures/live", { kind: "MJP17" });
    expect(first.headers.get("x-cache")).toBe("MISS");
    const second = await post("/fixtures/live", { kind: "MJP17" });
    expect(second.headers.get("x-cache")).toBe("HIT");
    expect(await second.json()).toEqual({ fixtures, sources: [] });
    expect(scrapeLive).toHaveBeenCalledTimes(1);
    await post("/fixtures/live", { kind: "MID13" });
    await post("/fixtures/live", { kind: "MJP17", refresh: true });
    expect(scrapeLive).toHaveBeenCalledTimes(3);
  });

  it("does not cache empty results", async () => {
    const scrapeLive = vi.fn(async () => ({ fixtures: [], sources: [] }));
    const post = await start({ scrapeLive, rateLimitPerMinute: 100 });
    expect((await post("/fixtures/live", { kind: "MJP17" })).status).toBe(404);
    await post("/fixtures/live", { kind: "MJP17" });
    expect(scrapeLive).toHaveBeenCalledTimes(2);
  });

  it("times out slow Gemini calls with 504", async () => {
    const scrapeLive = vi.fn(() => new Promise<never>(() => {}));
    const post = await start({ scrapeLive, upstreamTimeoutMs: 50, rateLimitPerMinute: 100 });
    const r = await post("/fixtures/live", { kind: "MJP17" });
    expect(r.status).toBe(504);
    expect((await r.json()).error).toMatch(/timed out/);
  });

  it("sends security headers", async () => {
    const post = await start({});
    const r = await post("/fixtures/parse", { text: "A vs B 2.0 3.0 4.0" });
    expect(r.headers.get("x-content-type-options")).toBe("nosniff");
    expect(r.headers.get("x-frame-options")).toBe("DENY");
  });
});

describe("guard helpers", () => {
  it("TtlCache expires entries", () => {
    let t = 0;
    const c = new TtlCache<number>(100, () => t);
    c.set("k", 1);
    t = 99;
    expect(c.get("k")).toEqual({ value: 1, ageMs: 99 });
    t = 100;
    expect(c.get("k")).toBeNull();
  });

  it("withTimeout passes fast results through", async () => {
    await expect(withTimeout(Promise.resolve(7), 50)).resolves.toBe(7);
    await expect(withTimeout(new Promise(() => {}), 10)).rejects.toBeInstanceOf(TimeoutError);
  });
});

describe("results lookup endpoint", () => {
  const list = [{ home: "Arsenal", away: "Chelsea", kickoff: "2026-10-25T14:00:00Z" }];

  it("validates the request", async () => {
    const post = await start({ rateLimitPerMinute: 100 });
    expect((await post("/fixtures/results", { kind: "MID13", fixtures: [] })).status).toBe(400);
    expect((await post("/fixtures/results", { kind: "MID13", fixtures: [{ home: "A" }] })).status).toBe(400);
    const tooMany = Array.from({ length: 14 }, () => list[0]);
    expect((await post("/fixtures/results", { kind: "MID13", fixtures: tooMany })).status).toBe(400);
  });

  it("returns the lookup and caches it per fixture list", async () => {
    const payload = { matches: [{ index: 0, homeGoals: 2, awayGoals: 1, status: "FT" }], payouts: { "13": 5000 }, sources: [] };
    const fetchResults = vi.fn(async () => payload);
    const post = await start({ fetchResults, rateLimitPerMinute: 100 });
    const a = await post("/fixtures/results", { kind: "MID13", fixtures: list });
    expect(a.status).toBe(200);
    expect(await a.json()).toEqual(payload);
    expect((await post("/fixtures/results", { kind: "MID13", fixtures: list })).headers.get("x-cache")).toBe("HIT");
    await post("/fixtures/results", { kind: "MID13", fixtures: list, refresh: true });
    expect(fetchResults).toHaveBeenCalledTimes(2);
    expect(fetchResults).toHaveBeenCalledWith("MID13", [{ home: "Arsenal", away: "Chelsea", kickoff: "2026-10-25T14:00:00.000Z" }]);
  });
});

describe("rate limiter behind a proxy", () => {
  it("warns once when X-Forwarded-For arrives without trust proxy", async () => {
    const { rateLimit } = await import("./guard");
    const warn = vi.fn();
    const app = express();
    app.use(rateLimit({ limit: 100, windowMs: 60_000, warn }));
    app.get("/", (_req, res) => res.send("ok"));
    server = app.listen(0);
    await new Promise((r) => server!.once("listening", r));
    const url = `http://127.0.0.1:${(server!.address() as AddressInfo).port}/`;
    await fetch(url);
    expect(warn).not.toHaveBeenCalled();
    await fetch(url, { headers: { "X-Forwarded-For": "1.2.3.4" } });
    await fetch(url, { headers: { "X-Forwarded-For": "5.6.7.8" } });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/TRUST_PROXY/);
  });

  it("stays quiet when trust proxy is configured", async () => {
    const { rateLimit } = await import("./guard");
    const warn = vi.fn();
    const app = express();
    app.set("trust proxy", 1);
    app.use(rateLimit({ limit: 100, windowMs: 60_000, warn }));
    app.get("/", (_req, res) => res.send("ok"));
    server = app.listen(0);
    await new Promise((r) => server!.once("listening", r));
    await fetch(`http://127.0.0.1:${(server!.address() as AddressInfo).port}/`, { headers: { "X-Forwarded-For": "1.2.3.4" } });
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("Gemini response handling", () => {
  it("extracts the fixture array from grounded prose with citation marks", async () => {
    const { extractJsonArray } = await import("./gemini");
    expect(extractJsonArray('Here is the coupon [1]:\n[{"home":"A","away":"B"}]\nSource: SportPesa [2]')).toEqual([{ home: "A", away: "B" }]);
    expect(extractJsonArray('{"fixtures":[{"home":"A","away":"B"}]}')).toEqual([{ home: "A", away: "B" }]);
    expect(extractJsonArray('```json\n[{"home":"A","away":"B"}]\n```')).toEqual([{ home: "A", away: "B" }]);
    // Prose with only a citation mark yields no fixtures (reported as "none found"), never a crash.
    const { sanitizeRaw } = await import("../src/domain/parser");
    expect(sanitizeRaw(extractJsonArray("I couldn't find the coupon [1]."))).toEqual([]);
    expect(() => extractJsonArray("I couldn't find the coupon.")).toThrow();
  });

  it("recognises a retired or unknown model so it can fall back", async () => {
    const { isModelUnavailable } = await import("./gemini");
    expect(isModelUnavailable({ status: 404, message: "models/gemini-2.5-flash is not found" })).toBe(true);
    expect(isModelUnavailable({ message: "Model gemini-2.5-flash is not supported for generateContent" })).toBe(true);
    expect(isModelUnavailable({ status: 429, message: "Resource exhausted" })).toBe(false);
    expect(isModelUnavailable({ status: 400, message: "API key not valid" })).toBe(false);
  });

  it("odds endpoint validates input and returns the lookup", async () => {
    const fetchOdds = vi.fn(async () => ({ odds: [{ index: 0, home: 2, draw: 3, away: 4 }], sources: [] }));
    const post = await start({ fetchOdds, rateLimitPerMinute: 100 });
    expect((await post("/fixtures/odds", { fixtures: [] })).status).toBe(400);
    const r = await post("/fixtures/odds", { fixtures: [{ home: "A", away: "B", kickoff: "2026-11-08T12:00:00Z" }] });
    expect(r.status).toBe(200);
    expect((await r.json()).odds).toHaveLength(1);
  });
});
