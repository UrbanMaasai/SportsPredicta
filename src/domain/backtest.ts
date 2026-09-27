import type { Fixture, JackpotKind, Outcome, StrategyId } from "./types";
import { RULES } from "./jackpot";
import { oddsFromStrength } from "./fixtures";
import { enrichFixture } from "./form";
import { impliedProbabilities } from "./odds";
import { hash, rng } from "./random";
import { buildStrategy } from "./strategies";

export interface HistoricalRound {
  id: string;
  kind: JackpotKind;
  date: string;
  fixtures: Fixture[];
  results: Record<string, Outcome>;
  /** Paid prize per winning line, keyed by tier. 0 = rolled over / no winners. */
  payouts: Record<number, number>;
  /** "verified" only for imported official results. */
  provenance: "verified" | "simulated";
}

export interface BacktestRound {
  roundId: string;
  date: string;
  correct: number;
  legs: number;
  tierHit: number | null;
  cost: number;
  payout: number;
}

export interface BacktestSummary {
  strategy: StrategyId;
  rounds: BacktestRound[];
  hitRate: number; // correct picks / legs
  avgCorrect: number;
  bestCorrect: number;
  tierHits: Record<number, number>;
  totalCost: number;
  totalPayout: number;
  roi: number;
}

export function runBacktest(archive: HistoricalRound[], strategy: StrategyId, doubles = 0): BacktestSummary {
  const tierHits: Record<number, number> = {};
  const rounds: BacktestRound[] = archive.map((r) => {
    const rules = RULES[r.kind];
    const sel = buildStrategy(strategy, r.fixtures, Math.min(doubles, rules.maxDoubles));
    const correct = r.fixtures.filter((f) => sel[f.id].includes(r.results[f.id])).length;
    const tiers = [rules.legs, ...rules.subTiers].sort((a, b) => b - a);
    const tierHit = tiers.find((t) => correct >= t) ?? null;
    if (tierHit) tierHits[tierHit] = (tierHits[tierHit] ?? 0) + 1;
    const lines = r.fixtures.reduce((a, f) => a * sel[f.id].length, 1);
    return {
      roundId: r.id,
      date: r.date,
      correct,
      legs: r.fixtures.length,
      tierHit,
      cost: lines * rules.stake,
      payout: tierHit ? r.payouts[tierHit] ?? 0 : 0,
    };
  });
  const totalLegs = rounds.reduce((s, r) => s + r.legs, 0);
  const totalCorrect = rounds.reduce((s, r) => s + r.correct, 0);
  const totalCost = rounds.reduce((s, r) => s + r.cost, 0);
  const totalPayout = rounds.reduce((s, r) => s + r.payout, 0);
  return {
    strategy,
    rounds,
    hitRate: totalLegs ? totalCorrect / totalLegs : 0,
    avgCorrect: rounds.length ? totalCorrect / rounds.length : 0,
    bestCorrect: rounds.reduce((m, r) => Math.max(m, r.correct), 0),
    tierHits,
    totalCost,
    totalPayout,
    roi: totalCost ? (totalPayout - totalCost) / totalCost : 0,
  };
}

const TEAMS = [
  "Arsenal", "Chelsea", "Everton", "Fulham", "Leeds", "Burnley", "Sevilla", "Getafe", "Valencia", "Roma", "Lazio",
  "Torino", "Genoa", "Mainz", "Bochum", "Lyon", "Nice", "Lens", "Nantes", "Ajax", "Twente", "Braga", "Porto", "Celtic",
  "Rangers", "Hearts", "Anderlecht", "Genk", "Basel", "Young Boys", "Salzburg", "Rapid Wien", "Malmo", "Molde",
];

/**
 * Simulated archive: rounds drawn from the same market model, results sampled from the
 * margin-free probabilities. Used for demonstrating the backtester until verified official
 * results are imported. Never presented as real payouts.
 */
export function simulatedArchive(kind: JackpotKind, rounds = 12, now = new Date()): HistoricalRound[] {
  const rules = RULES[kind];
  return Array.from({ length: rounds }, (_, k) => {
    const date = new Date(now);
    date.setDate(date.getDate() - 7 * (k + 1));
    const id = `${kind}-sim-${k + 1}`;
    const r = rng(hash(id));
    const fixtures: Fixture[] = [];
    const results: Record<string, Outcome> = {};
    for (let i = 0; i < rules.legs; i++) {
      const h = TEAMS[Math.floor(r() * TEAMS.length)];
      let a = TEAMS[Math.floor(r() * TEAMS.length)];
      if (a === h) a = TEAMS[(TEAMS.indexOf(h) + 1) % TEAMS.length];
      const odds = oddsFromStrength(0.3 + r() * 0.6, 0.3 + r() * 0.6, r());
      const f = enrichFixture({
        id: `${id}-${i + 1}`,
        leg: i + 1,
        home: h,
        away: a,
        league: "Archive",
        kickoff: date.toISOString(),
        odds,
        source: "seed",
      });
      fixtures.push(f);
      const p = impliedProbabilities(odds);
      const x = r();
      results[f.id] = x < p["1"] ? "1" : x < p["1"] + p.X ? "X" : "2";
    }
    const payouts: Record<number, number> = {};
    const tiers = [rules.legs, ...rules.subTiers];
    for (const t of tiers) payouts[t] = Math.round((t === rules.legs ? 0 : 20_000 * 3 ** (t - 13)) * (0.6 + r()));
    return { id, kind, date: date.toISOString(), fixtures, results, payouts, provenance: "simulated" as const };
  });
}

/** Validate an imported archive (JSON) and coerce it to HistoricalRound[] marked as verified. */
export function parseArchive(json: unknown): HistoricalRound[] {
  if (!Array.isArray(json)) throw new Error("Archive must be an array of rounds.");
  return json.map((raw, i) => {
    const r = raw as Partial<HistoricalRound>;
    if (!r.kind || !(r.kind in RULES)) throw new Error(`Round ${i + 1}: unknown kind.`);
    if (!Array.isArray(r.fixtures) || !r.results) throw new Error(`Round ${i + 1}: missing fixtures or results.`);
    const fixtures = r.fixtures.map((f, j) =>
      enrichFixture({ ...f, id: f.id ?? `${r.id ?? i}-${j + 1}`, leg: j + 1, source: "import" }),
    );
    return {
      id: r.id ?? `import-${i + 1}`,
      kind: r.kind,
      date: r.date ?? new Date().toISOString(),
      fixtures,
      results: r.results,
      payouts: r.payouts ?? {},
      provenance: "verified" as const,
    };
  });
}
