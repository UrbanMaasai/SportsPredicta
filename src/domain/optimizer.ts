import type { Fixture, Outcome, Selections } from "./types";
import type { JackpotRules } from "./jackpot";
import { combinations, sortOutcomes } from "./jackpot";
import { modelProbabilities } from "./strategies";

export interface OptimizerResult {
  selections: Selections;
  lines: number;
  cost: number;
  leftover: number;
  probability: number;
  doubles: string[];
  triples: string[];
  /** Probability multiplier gained vs the all-singles base slip. */
  lift: number;
}

interface LegOption {
  picks: Outcome[];
  logCov: number;
}

function legOptions(f: Fixture, base: Outcome, allowTriple: boolean): LegOption[] {
  const m = modelProbabilities(f);
  const others = (["1", "X", "2"] as Outcome[]).filter((o) => o !== base).sort((a, b) => m[b] - m[a]);
  const opts: LegOption[] = [
    { picks: [base], logCov: Math.log(m[base]) },
    { picks: sortOutcomes([base, others[0]]), logCov: Math.log(m[base] + m[others[0]]) },
  ];
  if (allowTriple) opts.push({ picks: ["1", "X", "2"], logCov: 0 });
  return opts;
}

/**
 * Knapsack-style budget optimiser. Starting from a single-pick base slip, choose which legs to
 * upgrade to double (x2 lines) or triple (x3 lines) to maximise the probability the slip lands,
 * subject to cost <= budget, the double-chance cap and the line cap. Solved exactly by dynamic
 * programming over (doubles, triples) counts.
 */
export function optimizeBudget(
  fixtures: Fixture[],
  base: Selections,
  rules: JackpotRules,
  budget: number,
): OptimizerResult | null {
  if (budget < rules.stake || fixtures.length === 0) return null;
  const maxLines = Math.min(rules.maxLines, Math.floor(budget / rules.stake));
  const allowTriple = rules.maxPicksPerLeg >= 3;
  const maxD = Math.min(rules.maxDoubles, Math.floor(Math.log2(maxLines)), fixtures.length);
  const maxT = allowTriple ? Math.floor(Math.log(maxLines) / Math.log(3)) : 0;

  const options = fixtures.map((f) => legOptions(f, (base[f.id] ?? [])[0] ?? "1", allowTriple));
  const NEG = -Infinity;
  // dp[d][t] = best sum of logCov using exactly d doubles and t triples over processed legs
  let dp: number[][] = Array.from({ length: maxD + 1 }, () => Array(maxT + 1).fill(NEG));
  let choice: number[][][] = Array.from({ length: maxD + 1 }, () => Array.from({ length: maxT + 1 }, () => []));
  dp[0][0] = 0;
  for (const opts of options) {
    const nd = Array.from({ length: maxD + 1 }, () => Array(maxT + 1).fill(NEG));
    const nc: number[][][] = Array.from({ length: maxD + 1 }, () => Array.from({ length: maxT + 1 }, () => []));
    for (let d = 0; d <= maxD; d++) {
      for (let t = 0; t <= maxT; t++) {
        if (dp[d][t] === NEG) continue;
        opts.forEach((o, k) => {
          const d2 = d + (k === 1 ? 1 : 0);
          const t2 = t + (k === 2 ? 1 : 0);
          if (d2 > maxD || t2 > maxT) return;
          const v = dp[d][t] + o.logCov;
          if (v > nd[d2][t2]) {
            nd[d2][t2] = v;
            nc[d2][t2] = [...choice[d][t], k];
          }
        });
      }
    }
    dp = nd;
    choice = nc;
  }

  let best: { d: number; t: number; v: number } | null = null;
  for (let d = 0; d <= maxD; d++) {
    for (let t = 0; t <= maxT; t++) {
      const lines = 2 ** d * 3 ** t;
      if (lines > maxLines || dp[d][t] === NEG) continue;
      if (!best || dp[d][t] > best.v + 1e-12) best = { d, t, v: dp[d][t] };
    }
  }
  if (!best) return null;

  const ks = choice[best.d][best.t];
  const selections: Selections = {};
  const doubles: string[] = [];
  const triples: string[] = [];
  fixtures.forEach((f, i) => {
    selections[f.id] = options[i][ks[i]].picks;
    if (ks[i] === 1) doubles.push(f.id);
    if (ks[i] === 2) triples.push(f.id);
  });
  const lines = combinations(selections, fixtures);
  const cost = lines * rules.stake;
  const baseLog = options.reduce((s, o) => s + o[0].logCov, 0);
  return {
    selections,
    lines,
    cost,
    leftover: budget - cost,
    probability: Math.exp(best.v),
    doubles,
    triples,
    lift: Math.exp(best.v - baseLog),
  };
}
