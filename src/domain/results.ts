import type { Coupon, Fixture, Outcome, Selections } from "./types";
import type { JackpotRules } from "./jackpot";
import type { HistoricalRound } from "./backtest";

/** Official full-time result per fixture id. Missing = not yet decided. */
export type Results = Record<string, Outcome>;

export interface SlipGrade {
  /** Legs whose result is known. */
  decided: number;
  total: number;
  /** Legs where the result is among the picks (the best line's score). */
  correct: number;
  /** Highest prize tier the best line reaches, or null. */
  tierHit: number | null;
  /** Number of combination lines with at least each tier's correct count, keyed by tier. */
  linesAtTier: Record<number, number>;
  /** Fixture ids where none of the picks matched the result. */
  missed: string[];
}

/**
 * Exact distribution of correct picks across all combination lines.
 * Each decided leg contributes (wrong + right·z): a line takes one pick per leg, and the
 * result is either among that leg's picks (one right pick) or not. Index k = lines with k correct.
 */
export function correctDistribution(selections: Selections, fixtures: Fixture[], results: Results): number[] {
  let poly = [1];
  for (const f of fixtures) {
    const picks = selections[f.id] ?? [];
    const r = results[f.id];
    const right = r && picks.includes(r) ? 1 : 0;
    const wrong = picks.length - right;
    const next = new Array(poly.length + 1).fill(0);
    poly.forEach((c, k) => {
      next[k] += c * wrong;
      next[k + 1] += c * right;
    });
    poly = next;
  }
  return poly;
}

export function gradeSlip(selections: Selections, fixtures: Fixture[], results: Results, rules: JackpotRules): SlipGrade {
  const decided = fixtures.filter((f) => results[f.id]).length;
  const missed = fixtures.filter((f) => results[f.id] && !(selections[f.id] ?? []).includes(results[f.id])).map((f) => f.id);
  const correct = decided - missed.length;
  const dist = correctDistribution(selections, fixtures, results);
  const tiers = [rules.legs, ...rules.subTiers].sort((a, b) => b - a);
  const linesAtTier: Record<number, number> = {};
  for (const t of tiers) linesAtTier[t] = dist.slice(t).reduce((s, n) => s + n, 0);
  return { decided, total: fixtures.length, correct, tierHit: tiers.find((t) => correct >= t) ?? null, linesAtTier, missed };
}

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]/g, "");

/** Lenient team-name match: exact after normalising, or one name containing the other. */
function sameTeam(a: string, b: string): boolean {
  const x = norm(a);
  const y = norm(b);
  return x === y || (x.length >= 4 && y.length >= 4 && (x.includes(y) || y.includes(x)));
}

export interface ParsedResults {
  results: Results;
  /** Input lines that could not be matched to a fixture. */
  unmatched: string[];
}

/**
 * Parse official results. Accepts either a compact code with one 1/X/2 per leg in coupon order
 * (optionally prefixed like `MJP#`, separators ignored), or score lines such as
 * `Arsenal 2-1 Chelsea` / `Arsenal vs Chelsea 2:1`, matched to fixtures by team names.
 */
export function parseResults(text: string, fixtures: Fixture[]): ParsedResults {
  const compact = text.trim().toUpperCase().replace(/^[A-Z]+#/, "").replace(/[\s,;|/-]/g, "");
  if (compact.length > 0 && /^[1X2]+$/.test(compact) && compact.length <= fixtures.length) {
    const results: Results = {};
    [...compact].forEach((c, i) => (results[fixtures[i].id] = c as Outcome));
    return { results, unmatched: [] };
  }
  const results: Results = {};
  const unmatched: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const score = line.match(/(\d{1,2})\s*[-:–]\s*(\d{1,2})/);
    const l = norm(line);
    const words = line.split(/\s+/);
    const f =
      fixtures.find((x) => l.includes(norm(x.home)) && l.includes(norm(x.away))) ??
      fixtures.find((x) => [x.home, x.away].every((t) => l.includes(norm(t)) || words.some((w) => sameTeam(w, t))));
    if (!score || !f) {
      unmatched.push(line);
      continue;
    }
    // Score order follows the line; flip when the away team is written first.
    const awayFirst = norm(line).indexOf(norm(f.away)) >= 0 && norm(line).indexOf(norm(f.away)) < norm(line).indexOf(norm(f.home));
    let [h, a] = [Number(score[1]), Number(score[2])];
    if (awayFirst) [h, a] = [a, h];
    results[f.id] = h > a ? "1" : h < a ? "2" : "X";
  }
  return { results, unmatched };
}

/** A settled coupon as a backtest round. */
export function toHistoricalRound(coupon: Coupon, results: Results, payouts: Record<number, number> = {}): HistoricalRound {
  return {
    id: coupon.id,
    kind: coupon.kind,
    date: coupon.fixtures[0]?.kickoff ?? coupon.fetchedAt,
    fixtures: coupon.fixtures,
    results,
    payouts,
    provenance: "entered",
  };
}

export function isSettled(coupon: Coupon, results: Results): boolean {
  return coupon.fixtures.length > 0 && coupon.fixtures.every((f) => results[f.id]);
}

// ---------- Fetched results (AI search) ----------

/** A fixture as sent to the results lookup: just what is needed to identify the match. */
export interface ResultQuery {
  home: string;
  away: string;
  kickoff: string;
}

/** Raw shape the server returns: per-fixture scores by coupon position, plus any published payouts. */
export interface FetchedResults {
  matches: { index: number; homeGoals?: number | null; awayGoals?: number | null; status?: string }[];
  payouts?: Record<string, number>;
  sources?: { title: string; uri: string }[];
}

export interface AppliedFetch {
  results: Results;
  payouts: Record<number, number>;
  /** Fixtures the lookup could not settle (not played, postponed, unknown, or not yet kicked off). */
  unresolved: number;
}

const isGoals = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0 && n < 30;

/**
 * Turn a fetched lookup into results for this coupon. Only full-time scores for fixtures that have
 * actually kicked off are accepted; payouts are kept only for real tiers of this jackpot.
 */
export function applyFetchedResults(
  raw: unknown,
  fixtures: Fixture[],
  tiers: number[],
  now = Date.now(),
): AppliedFetch {
  const data = (raw ?? {}) as FetchedResults;
  const results: Results = {};
  for (const m of Array.isArray(data.matches) ? data.matches : []) {
    const f = fixtures[m?.index];
    if (!f || new Date(f.kickoff).getTime() > now) continue;
    const status = String(m.status ?? "FT").toUpperCase();
    if (!["FT", "AET", "PEN", "FINISHED"].includes(status)) continue;
    if (!isGoals(m.homeGoals) || !isGoals(m.awayGoals)) continue;
    results[f.id] = m.homeGoals > m.awayGoals ? "1" : m.homeGoals < m.awayGoals ? "2" : "X";
  }
  const payouts: Record<number, number> = {};
  for (const [k, v] of Object.entries(data.payouts ?? {})) {
    const tier = Number(k);
    if (tiers.includes(tier) && typeof v === "number" && Number.isFinite(v) && v >= 0) payouts[tier] = Math.round(v);
  }
  return { results, payouts, unresolved: fixtures.length - Object.keys(results).length };
}
