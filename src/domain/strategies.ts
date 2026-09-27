import type { Fixture, Outcome, Selections, StrategyId } from "./types";
import { impliedProbabilities, isDrawZone, oddsFor, predictability, rankOutcomes } from "./odds";
import { inSlump, momentum } from "./form";
import { sortOutcomes } from "./jackpot";

export const STRATEGIES: Record<StrategyId, { label: string; blurb: string }> = {
  favorites: { label: "Favorites", blurb: "Lowest market price on every leg." },
  balanced: { label: "Balanced mix", blurb: "Favorites, draw-zone legs and form-backed underdogs." },
  bold: { label: "Bold value", blurb: "Contrarian upsets where form beats the price." },
};

/**
 * Form-adjusted probabilities: shift market probability toward the side with better
 * momentum and away from a side on a losing slump.
 */
export function modelProbabilities(f: Fixture): Record<Outcome, number> {
  const p = impliedProbabilities(f.odds);
  let shift = 0.07 * (momentum(f.homeForm) - momentum(f.awayForm));
  if (inSlump(f.homeForm)) shift -= 0.05;
  if (inSlump(f.awayForm)) shift += 0.05;
  const home = Math.max(0.02, p["1"] + shift);
  const away = Math.max(0.02, p["2"] - shift);
  const draw = p.X;
  const sum = home + draw + away;
  return { "1": home / sum, X: draw / sum, "2": away / sum };
}

/** Expected value per unit staked on a single outcome, using model probability. */
export function edge(f: Fixture, o: Outcome): number {
  return modelProbabilities(f)[o] * oddsFor(f.odds, o) - 1;
}

export function pickFavorite(f: Fixture): Outcome {
  return rankOutcomes(f.odds)[0];
}

export function pickBalanced(f: Fixture): Outcome {
  const p = impliedProbabilities(f.odds);
  const m = modelProbabilities(f);
  const fav = rankOutcomes(f.odds)[0];
  if (p[fav] >= 0.55) return fav;
  if (isDrawZone(f.odds) && p[fav] < 0.47) return "X";
  const dog: Outcome = fav === "1" ? "2" : fav === "2" ? "1" : m["1"] > m["2"] ? "1" : "2";
  const dogOdds = oddsFor(f.odds, dog);
  if (dogOdds >= 2.4 && dogOdds <= 4.2 && m[dog] > m[fav]) return dog;
  return (Object.keys(m) as Outcome[]).reduce((a, b) => (m[b] > m[a] ? b : a));
}

export function pickBold(f: Fixture): Outcome {
  const fav = rankOutcomes(f.odds)[0];
  const candidates = (["1", "X", "2"] as Outcome[]).filter((o) => o !== fav && oddsFor(f.odds, o) >= 2.5);
  const best = candidates.reduce<{ o: Outcome; e: number } | null>((acc, o) => {
    const e = edge(f, o);
    return !acc || e > acc.e ? { o, e } : acc;
  }, null);
  // Only go contrarian when the favourite is beatable and the upset carries value by the form
  // model, or when the favourite is fragile outright. Heavy favourites are never opposed.
  const pFav = impliedProbabilities(f.odds)[fav];
  if (best && ((best.e > -0.02 && pFav < 0.62) || pFav < 0.42)) return best.o;
  return fav;
}

const PICKERS: Record<StrategyId, (f: Fixture) => Outcome> = {
  favorites: pickFavorite,
  balanced: pickBalanced,
  bold: pickBold,
};

export function pickFor(strategy: StrategyId, f: Fixture): Outcome {
  return PICKERS[strategy](f);
}

/** Least predictable legs first. */
export function legsByUncertainty(fixtures: Fixture[]): Fixture[] {
  return [...fixtures].sort((a, b) => predictability(a.odds) - predictability(b.odds));
}

/** Add the next most likely outcome to the `n` least predictable legs. */
export function applyDoubles(selections: Selections, fixtures: Fixture[], n: number): Selections {
  const out: Selections = { ...selections };
  for (const f of legsByUncertainty(fixtures).slice(0, Math.max(0, n))) {
    const cur = out[f.id] ?? [];
    if (cur.length !== 1) continue;
    const m = modelProbabilities(f);
    const next = (["1", "X", "2"] as Outcome[]).filter((o) => o !== cur[0]).sort((a, b) => m[b] - m[a])[0];
    out[f.id] = sortOutcomes([cur[0], next]);
  }
  return out;
}

export function buildStrategy(strategy: StrategyId, fixtures: Fixture[], doubles = 0): Selections {
  const base: Selections = {};
  for (const f of fixtures) base[f.id] = [pickFor(strategy, f)];
  return applyDoubles(base, fixtures, doubles);
}

// ---------- Comparison ----------

export interface ComparisonRow {
  fixture: Fixture;
  conservative: Outcome;
  bold: Outcome;
  agree: boolean;
  /** Suggested hedge (double) when the two strategies disagree. */
  hedge: Outcome[] | null;
}

export function compareStrategies(fixtures: Fixture[]): ComparisonRow[] {
  return fixtures.map((f) => {
    const c = pickFavorite(f);
    const b = pickBold(f);
    return { fixture: f, conservative: c, bold: b, agree: c === b, hedge: c === b ? null : sortOutcomes([c, b]) };
  });
}

// ---------- Consensus ----------

export type AgreementTier = "Unanimous" | "Strong" | "Split";

export interface ConsensusRow {
  fixture: Fixture;
  votes: Record<string, Outcome>;
  pick: Outcome;
  agreement: number; // share of models on the consensus pick
  tier: AgreementTier;
  confidence: number; // 0..1
}

export const CONSENSUS_MODELS: Record<string, (f: Fixture) => Outcome> = {
  Market: pickFavorite,
  Form: (f) => {
    const m = modelProbabilities(f);
    return (Object.keys(m) as Outcome[]).reduce((a, b) => (m[b] > m[a] ? b : a));
  },
  Balanced: pickBalanced,
  Value: pickBold,
};

export function consensus(fixtures: Fixture[]): ConsensusRow[] {
  const names = Object.keys(CONSENSUS_MODELS);
  return fixtures.map((f) => {
    const votes: Record<string, Outcome> = {};
    const tally: Record<Outcome, number> = { "1": 0, X: 0, "2": 0 };
    for (const n of names) {
      const o = CONSENSUS_MODELS[n](f);
      votes[n] = o;
      tally[o]++;
    }
    const m = modelProbabilities(f);
    const pick = (Object.keys(tally) as Outcome[]).reduce((a, b) =>
      tally[b] > tally[a] || (tally[b] === tally[a] && m[b] > m[a]) ? b : a,
    );
    const agreement = tally[pick] / names.length;
    const tier: AgreementTier = agreement === 1 ? "Unanimous" : agreement >= 0.75 ? "Strong" : "Split";
    const confidence = Math.min(1, agreement * 0.5 + m[pick] * 0.5 + predictability(f.odds) * 0.2);
    return { fixture: f, votes, pick, agreement, tier, confidence };
  });
}

/** Probability the whole slip lands, using model probabilities per leg. */
export function slipProbability(selections: Selections, fixtures: Fixture[], exclude: string[] = []): number {
  return fixtures.reduce((acc, f) => {
    if (exclude.includes(f.id)) return acc;
    const m = modelProbabilities(f);
    return acc * (selections[f.id] ?? []).reduce((s, o) => s + m[o], 0);
  }, 1);
}
