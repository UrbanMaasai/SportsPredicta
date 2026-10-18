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
