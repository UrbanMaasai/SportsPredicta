// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createApi } from "./app";
import { extractJsonArray } from "./gemini";

let server: Server;
let base = "";

beforeAll(async () => {
  delete process.env.GEMINI_API_KEY;
  const app = express();
  app.use("/api", createApi());
  server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});
afterAll(() => server.close());

const post = (path: string, body: unknown) =>
  fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

describe("API", () => {
  it("reports health and Gemini availability", async () => {
    const r = await (await fetch(`${base}/health`)).json();
    expect(r).toMatchObject({ ok: true, gemini: false });
  });

  it("validates the jackpot kind", async () => {
    expect((await post("/fixtures/live", { kind: "X" })).status).toBe(400);
  });

  it("returns 503 with a clear message when Gemini is not configured", async () => {
    const r = await post("/fixtures/live", { kind: "MJP17" });
    expect(r.status).toBe(503);
    expect((await r.json()).error).toMatch(/GEMINI_API_KEY/);
  });

  it("rejects unsupported image types", async () => {
    expect((await post("/fixtures/ocr", { image: "abc", mimeType: "image/gif" })).status).toBe(400);
  });

  it("parses coupon text locally", async () => {
    const r = await (await post("/fixtures/parse", { text: "Arsenal vs Chelsea 1.85 3.40 4.20" })).json();
    expect(r.engine).toBe("local");
    expect(r.fixtures[0]).toMatchObject({ home: "Arsenal", away: "Chelsea" });
  });
});

describe("extractJsonArray", () => {
  it("handles fenced and bare JSON", () => {
    expect(extractJsonArray('Here:\n```json\n[{"a":1}]\n```')).toEqual([{ a: 1 }]);
    expect(extractJsonArray('prefix [1,2] suffix')).toEqual([1, 2]);
    expect(() => extractJsonArray("no json")).toThrow();
  });
});
