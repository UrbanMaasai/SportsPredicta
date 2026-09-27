import express, { type NextFunction, type Request, type Response } from "express";
import type { JackpotKind } from "../src/domain/types";
import { RULES } from "../src/domain/jackpot";
import { parseCouponText } from "../src/domain/parser";
import { ConfigError, geminiConfigured, ocrCoupon, parseTextAI, scrapeLive } from "./gemini";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

function isKind(v: unknown): v is JackpotKind {
  return typeof v === "string" && v in RULES;
}

type Handler = (req: Request, res: Response) => Promise<unknown>;
const wrap = (fn: Handler) => (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);

export function createApi() {
  const api = express.Router();
  api.use(express.json({ limit: "12mb" }));

  api.get("/health", (_req, res) => {
    res.json({ ok: true, gemini: geminiConfigured(), time: new Date().toISOString() });
  });

  api.post(
    "/fixtures/live",
    wrap(async (req, res) => {
      const kind = req.body?.kind;
      if (!isKind(kind)) return res.status(400).json({ error: "kind must be MJP17 or MID13" });
      const result = await scrapeLive(kind);
      if (result.fixtures.length === 0) {
        return res.status(404).json({ error: "No upcoming fixtures found for this jackpot.", sources: result.sources });
      }
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
      const fixtures = await ocrCoupon(data, mimeType);
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
      res.json({ fixtures: await parseTextAI(text), engine: "gemini" });
    }),
  );

  api.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ConfigError) return res.status(503).json({ error: err.message });
    const message = err instanceof Error ? err.message : "Unexpected error";
    console.error("[api]", message);
    res.status(502).json({ error: `Upstream request failed: ${message}` });
  });

  return api;
}
