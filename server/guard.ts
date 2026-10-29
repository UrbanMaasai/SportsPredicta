import type { NextFunction, Request, Response } from "express";

/** Thrown when an upstream call takes too long; mapped to 504. */
export class TimeoutError extends Error {}

export function withTimeout<T>(p: Promise<T>, ms: number, what = "Upstream request"): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    p,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new TimeoutError(`${what} timed out after ${Math.round(ms / 1000)}s.`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

/**
 * Fixed-window rate limiter keyed by client IP. In-memory, so it is per server process —
 * enough to stop one client running up the Gemini bill; put a shared limiter in front when scaling out.
 */
export function rateLimit({ limit, windowMs, now = Date.now }: { limit: number; windowMs: number; now?: () => number }) {
  const hits = new Map<string, { start: number; count: number }>();
  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip ?? "unknown";
    const t = now();
    let w = hits.get(key);
    if (!w || t - w.start >= windowMs) {
      w = { start: t, count: 0 };
      hits.set(key, w);
      // Drop expired windows so the map can't grow without bound.
      if (hits.size > 10_000) for (const [k, v] of hits) if (t - v.start >= windowMs) hits.delete(k);
    }
    w.count++;
    res.setHeader("RateLimit-Limit", String(limit));
    res.setHeader("RateLimit-Remaining", String(Math.max(0, limit - w.count)));
    if (w.count > limit) {
      const retry = Math.ceil((w.start + windowMs - t) / 1000);
      res.setHeader("Retry-After", String(retry));
      return res.status(429).json({ error: `Too many requests. Try again in ${retry}s.` });
    }
    next();
  };
}

/** Small TTL cache for expensive, slowly-changing upstream results. */
export class TtlCache<V> {
  private store = new Map<string, { at: number; value: V }>();
  constructor(
    private ttlMs: number,
    private now: () => number = Date.now,
  ) {}
  get(key: string): { value: V; ageMs: number } | null {
    const e = this.store.get(key);
    if (!e) return null;
    const age = this.now() - e.at;
    if (age >= this.ttlMs) {
      this.store.delete(key);
      return null;
    }
    return { value: e.value, ageMs: age };
  }
  set(key: string, value: V): void {
    this.store.set(key, { at: this.now(), value });
  }
}

/** Conservative security headers. No CSP: Firebase's Google sign-in popup and Google Fonts need cross-origin loads. */
export function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
}
