import type { Odds, Outcome } from "./types";

export function oddsFor(odds: Odds, o: Outcome): number {
  return o === "1" ? odds.home : o === "X" ? odds.draw : odds.away;
}

/** Bookmaker margin: sum of implied probabilities minus one. */
export function overround(odds: Odds): number {
  return 1 / odds.home + 1 / odds.draw + 1 / odds.away - 1;
}

/** Margin-free outcome probabilities (proportional normalisation). */
export function impliedProbabilities(odds: Odds): Record<Outcome, number> {
  const raw = { "1": 1 / odds.home, X: 1 / odds.draw, "2": 1 / odds.away };
  const sum = raw["1"] + raw.X + raw["2"];
  return { "1": raw["1"] / sum, X: raw.X / sum, "2": raw["2"] / sum };
}

export function favorite(odds: Odds): Outcome {
  const p = impliedProbabilities(odds);
  return (Object.keys(p) as Outcome[]).reduce((a, b) => (p[b] > p[a] ? b : a));
}

/** Outcomes ranked by market probability, most likely first. */
export function rankOutcomes(odds: Odds): Outcome[] {
  const p = impliedProbabilities(odds);
  return (["1", "X", "2"] as Outcome[]).sort((a, b) => p[b] - p[a]);
}

/** Probability that at least one of the picks lands. */
export function coverage(odds: Odds, picks: Outcome[]): number {
  const p = impliedProbabilities(odds);
  return picks.reduce((s, o) => s + p[o], 0);
}

/**
 * Predictability: 0 (three-way coin flip) to 1 (certain). Blends favourite strength above 1/3
 * with normalised Shannon entropy so both a dominant favourite and a lopsided spread score high.
 */
export function predictability(odds: Odds): number {
  const p = impliedProbabilities(odds);
  const top = Math.max(p["1"], p.X, p["2"]);
  const h = -(["1", "X", "2"] as Outcome[]).reduce((s, o) => s + (p[o] > 0 ? p[o] * Math.log(p[o]) : 0), 0);
  const favStrength = (top - 1 / 3) / (2 / 3);
  const certainty = 1 - h / Math.log(3);
  return Math.max(0, Math.min(1, 0.7 * favStrength + 0.3 * certainty));
}

export function isDrawZone(odds: Odds): boolean {
  return odds.draw >= 2.9 && odds.draw <= 3.2;
}

export function formatOdds(n: number): string {
  return n.toFixed(2);
}
