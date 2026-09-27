import type { Fixture, Outcome, Selections } from "./types";
import { impliedProbabilities } from "./odds";
import { hash, rng } from "./random";

export interface SimMatch {
  fixtureId: string;
  homeGoals: number[]; // minutes
  awayGoals: number[];
}

export interface MatchState {
  fixtureId: string;
  home: number;
  away: number;
  outcome: Outcome;
}

/**
 * Convert 1X2 probabilities into Poisson goal rates. Total goals fixed near league average;
 * split by the home/away strength ratio implied by the market.
 */
export function goalRates(f: Fixture): { home: number; away: number } {
  const p = impliedProbabilities(f.odds);
  const total = 2.65 - (p.X - 0.27) * 2;
  const ratio = Math.sqrt((p["1"] + 0.05) / (p["2"] + 0.05));
  const away = total / (1 + ratio);
  return { home: total - away, away };
}

export function simulateMatches(fixtures: Fixture[], seed: number): SimMatch[] {
  return fixtures.map((f) => {
    const r = rng(hash(f.id) ^ seed);
    const { home, away } = goalRates(f);
    const homeGoals: number[] = [];
    const awayGoals: number[] = [];
    for (let m = 1; m <= 90; m++) {
      if (r() < home / 90) homeGoals.push(m);
      if (r() < away / 90) awayGoals.push(m);
    }
    return { fixtureId: f.id, homeGoals, awayGoals };
  });
}

export function outcomeOf(home: number, away: number): Outcome {
  return home > away ? "1" : home < away ? "2" : "X";
}

export function stateAt(sim: SimMatch[], minute: number): MatchState[] {
  return sim.map((s) => {
    const home = s.homeGoals.filter((m) => m <= minute).length;
    const away = s.awayGoals.filter((m) => m <= minute).length;
    return { fixtureId: s.fixtureId, home, away, outcome: outcomeOf(home, away) };
  });
}

export interface Survival {
  correct: number;
  total: number;
  /** Highest prize tier still satisfied at this moment. */
  tierAlive: number | null;
  wrongLegs: string[];
}

export function ticketSurvival(
  states: MatchState[],
  selections: Selections,
  tiers: number[],
  excluded: string[] = [],
): Survival {
  let correct = 0;
  const wrongLegs: string[] = [];
  for (const s of states) {
    if (excluded.includes(s.fixtureId)) continue;
    if ((selections[s.fixtureId] ?? []).includes(s.outcome)) correct++;
    else wrongLegs.push(s.fixtureId);
  }
  const reached = [...tiers].sort((a, b) => b - a).find((t) => correct >= t) ?? null;
  return { correct, total: states.length - excluded.length, tierAlive: reached, wrongLegs };
}
