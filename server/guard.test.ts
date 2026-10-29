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
