import express, { type NextFunction, type Request, type Response } from "express";
import type { JackpotKind } from "../src/domain/types";
import { RULES } from "../src/domain/jackpot";
import { parseCouponText } from "../src/domain/parser";
import * as gemini from "./gemini";
import { ConfigError } from "./gemini";
import { rateLimit, TimeoutError, TtlCache, withTimeout } from "./guard";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

function isKind(v: unknown): v is JackpotKind {
  return typeof v === "string" && v in RULES;
}

type Handler = (req: Request, res: Response) => Promise<unknown>;
const wrap = (fn: Handler) => (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);

export interface ApiDeps {
  scrapeLive: typeof gemini.scrapeLive;
  ocrCoupon: typeof gemini.ocrCoupon;
  parseTextAI: typeof gemini.parseTextAI;
  geminiConfigured: () => boolean;
  now: () => number;
  /** Requests per client per minute to the fixture endpoints (all of which may call Gemini). */
  rateLimitPerMinute: number;
  /** How long a live-search result is reused before Gemini is asked again. */
  liveCacheMs: number;
  /** Upper bound on any single Gemini call. */
  upstreamTimeoutMs: number;
}

const DEFAULT_DEPS: ApiDeps = {
  scrapeLive: gemini.scrapeLive,
  ocrCoupon: gemini.ocrCoupon,
  parseTextAI: gemini.parseTextAI,
  geminiConfigured: gemini.geminiConfigured,
  now: Date.now,
  rateLimitPerMinute: Number(process.env.API_RATE_LIMIT_PER_MIN ?? 20),
  liveCacheMs: 10 * 60_000,
  upstreamTimeoutMs: 60_000,
};

export function createApi(overrides: Partial<ApiDeps> = {}) {
  const deps = { ...DEFAULT_DEPS, ...overrides };
  const { scrapeLive, ocrCoupon, parseTextAI, geminiConfigured } = deps;
  const liveCache = new TtlCache<Awaited<ReturnType<typeof gemini.scrapeLive>>>(deps.liveCacheMs, deps.now);
  const timed = <T>(p: Promise<T>) => withTimeout(p, deps.upstreamTimeoutMs, "Gemini");

  const api = express.Router();
  api.use(express.json({ limit: "12mb" }));

  api.get("/health", (_req, res) => {
    res.json({ ok: true, gemini: geminiConfigured(), time: new Date(deps.now()).toISOString() });
  });

  api.use("/fixtures", rateLimit({ limit: deps.rateLimitPerMinute, windowMs: 60_000, now: deps.now }));

  api.post(
    "/fixtures/live",
    wrap(async (req, res) => {
      const kind = req.body?.kind;
      if (!isKind(kind)) return res.status(400).json({ error: "kind must be MJP17 or MID13" });
      // Coupons change rarely; reuse a recent result unless the client asks for a fresh search.
      const cached = req.body?.refresh ? null : liveCache.get(kind);
      if (cached) {
        res.setHeader("X-Cache", "HIT");
        res.setHeader("Age", String(Math.floor(cached.ageMs / 1000)));
        return res.json(cached.value);
      }
      const result = await timed(scrapeLive(kind));
      if (result.fixtures.length === 0) {
        return res.status(404).json({ error: "No upcoming fixtures found for this jackpot.", sources: result.sources });
      }
      liveCache.set(kind, result);
      res.setHeader("X-Cache", "MISS");
      res.json(result);
    }),
  );

  api.post(
    "/fixtures/ocr",
    wrap(async (req, res) => {
      const { image, mimeType } = req.body ?? {};
      if (typeof image !== "string" || !IMAGE_TYPES.has(mimeType)) {
        return res.status(400).json({ error: "Send a base64 PNG, JPEG or WebP image." });
      }
      const data = image.replace(/^data:[^;]+;base64,/, "");
      if (Buffer.byteLength(data, "base64") > MAX_IMAGE_BYTES) {
        return res.status(413).json({ error: "Image is larger than 8 MB." });
      }
      const fixtures = await timed(ocrCoupon(data, mimeType));
      res.json({ fixtures });
    }),
  );

  api.post(
    "/fixtures/parse",
    wrap(async (req, res) => {
      const text = req.body?.text;
      if (typeof text !== "string" || !text.trim()) return res.status(400).json({ error: "text is required" });
      const local = parseCouponText(text);
      if (local.length > 0 || !geminiConfigured()) return res.json({ fixtures: local, engine: "local" });
      res.json({ fixtures: await timed(parseTextAI(text)), engine: "gemini" });
    }),
  );

  api.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ConfigError) return res.status(503).json({ error: err.message });
    if (err instanceof TimeoutError) return res.status(504).json({ error: err.message });
    const message = err instanceof Error ? err.message : "Unexpected error";
    console.error("[api]", message);
    res.status(502).json({ error: `Upstream request failed: ${message}` });
  });

  return api;
}
