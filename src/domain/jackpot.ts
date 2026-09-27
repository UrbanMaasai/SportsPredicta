import type { Fixture, JackpotKind, Outcome, Selections } from "./types";

export interface JackpotRules {
  kind: JackpotKind;
  name: string;
  shortName: string;
  legs: number;
  stake: number;
  maxPicksPerLeg: 2 | 3;
  /** Cap on legs carrying two picks. */
  maxDoubles: number;
  /** Cap on total combination lines per slip. */
  maxLines: number;
  /** Sub-jackpot tiers that can be targeted by excluding legs. Empty = single tier. */
  subTiers: number[];
  /** SMS keyword prefix used for 79079. */
  smsPrefix: string;
}

export const RULES: Record<JackpotKind, JackpotRules> = {
  MJP17: {
    kind: "MJP17",
    name: "Mega Jackpot Pro",
    shortName: "MJP 17",
    legs: 17,
    stake: 99,
    maxPicksPerLeg: 3,
    maxDoubles: 7,
    maxLines: 128,
    subTiers: [13, 14, 15, 16],
    smsPrefix: "MJP",
  },
  MID13: {
    kind: "MID13",
    name: "Midweek Jackpot",
    shortName: "Midweek 13",
    legs: 13,
    stake: 99,
    maxPicksPerLeg: 2,
    maxDoubles: 7,
    maxLines: 128,
    subTiers: [],
    smsPrefix: "JP",
  },
};

/** Total lines = product of |S_i| over all legs. An empty leg yields 0 lines. */
export function combinations(selections: Selections, fixtures: Fixture[]): number {
  if (fixtures.length === 0) return 0;
  return fixtures.reduce((acc, f) => acc * (selections[f.id]?.length ?? 0), 1);
}

export function ticketCost(lines: number, rules: JackpotRules): number {
  return lines * rules.stake;
}

export function countByPicks(selections: Selections, fixtures: Fixture[]) {
  let singles = 0, doubles = 0, triples = 0, empty = 0;
  for (const f of fixtures) {
    const n = selections[f.id]?.length ?? 0;
    if (n === 0) empty++;
    else if (n === 1) singles++;
    else if (n === 2) doubles++;
    else triples++;
  }
  return { singles, doubles, triples, empty };
}

export type IssueLevel = "error" | "warning";
export interface Issue {
  level: IssueLevel;
  code: string;
  message: string;
  fixtureId?: string;
}

export function validateSlip(
  selections: Selections,
  fixtures: Fixture[],
  rules: JackpotRules,
  excluded: string[] = [],
): Issue[] {
  const issues: Issue[] = [];
  if (fixtures.length !== rules.legs) {
    issues.push({
      level: "error",
      code: "LEG_COUNT",
      message: `${rules.shortName} needs exactly ${rules.legs} fixtures; coupon has ${fixtures.length}.`,
    });
  }
  for (const f of fixtures) {
    const picks = selections[f.id] ?? [];
    if (picks.length === 0) {
      issues.push({ level: "error", code: "EMPTY_LEG", message: `Leg ${f.leg} has no pick.`, fixtureId: f.id });
    }
    if (picks.length > rules.maxPicksPerLeg) {
      issues.push({
        level: "error",
        code: rules.maxPicksPerLeg === 2 ? "TRIPLE_FORBIDDEN" : "TOO_MANY_PICKS",
        message:
          rules.maxPicksPerLeg === 2
            ? `Leg ${f.leg}: triple chance (1-X-2) is not allowed on the ${rules.name}.`
            : `Leg ${f.leg} has more than ${rules.maxPicksPerLeg} picks.`,
        fixtureId: f.id,
      });
    }
    if (new Set(picks).size !== picks.length) {
      issues.push({ level: "error", code: "DUPLICATE_PICK", message: `Leg ${f.leg} repeats a pick.`, fixtureId: f.id });
    }
  }
  const { doubles } = countByPicks(selections, fixtures);
  if (doubles > rules.maxDoubles) {
    issues.push({
      level: "error",
      code: "MAX_DOUBLES",
      message: `${doubles} double chances exceeds the cap of ${rules.maxDoubles}.`,
    });
  }
  const lines = combinations(selections, fixtures);
  if (lines > rules.maxLines) {
    issues.push({
      level: "error",
      code: "MAX_LINES",
      message: `${lines.toLocaleString()} lines exceeds the ${rules.maxLines}-line cap.`,
    });
  }
  if (excluded.length > 0) {
    if (rules.subTiers.length === 0) {
      issues.push({
        level: "error",
        code: "NO_SUB_TIERS",
        message: `${rules.name} is single-tier; legs cannot be excluded.`,
      });
    } else {
      const maxExcl = rules.legs - Math.min(...rules.subTiers);
      if (excluded.length > maxExcl) {
        issues.push({
          level: "error",
          code: "TOO_MANY_EXCLUDED",
          message: `At most ${maxExcl} legs can be excluded (lowest tier is ${Math.min(...rules.subTiers)}).`,
        });
      }
    }
  }
  return issues;
}

/**
 * Sub-jackpot tier reached when every non-excluded leg is correct.
 * With 0 excluded the slip is playing for the full jackpot.
 */
export function targetTier(rules: JackpotRules, excludedCount: number): number {
  return rules.legs - excludedCount;
}

export interface PrizeTable {
  /** Prize pool per tier, keyed by number of correct predictions. */
  pools: Record<number, number>;
}

/**
 * Default prize pools. SportPesa publishes the pool on each coupon; these are editable
 * starting points and should be overwritten with the current coupon's figures.
 */
export const DEFAULT_PRIZES: Record<JackpotKind, PrizeTable> = {
  MJP17: { pools: { 17: 400_000_000, 16: 12_000_000, 15: 2_500_000, 14: 800_000, 13: 300_000 } },
  MID13: { pools: { 13: 15_000_000 } },
};

export interface TierPlan {
  tier: number;
  excludedCount: number;
  pool: number;
  /** Ratio of pool to ticket cost. */
  leverage: number;
}

export function tierPlans(rules: JackpotRules, prizes: PrizeTable, cost: number): TierPlan[] {
  const tiers = [rules.legs, ...[...rules.subTiers].sort((a, b) => b - a)];
  return tiers.map((tier) => {
    const pool = prizes.pools[tier] ?? 0;
    return { tier, excludedCount: rules.legs - tier, pool, leverage: cost > 0 ? pool / cost : 0 };
  });
}

/** Expand a multi-pick slip into all concrete single-pick lines (cartesian product). */
export function expandLines(selections: Selections, fixtures: Fixture[], limit = 10_000): Outcome[][] {
  let lines: Outcome[][] = [[]];
  for (const f of fixtures) {
    const picks = selections[f.id] ?? [];
    const next: Outcome[][] = [];
    for (const line of lines) {
      for (const p of picks) {
        next.push([...line, p]);
        if (next.length > limit) throw new Error(`Line expansion exceeds ${limit}`);
      }
    }
    lines = next;
  }
  return fixtures.length === 0 ? [] : lines;
}

export function togglePick(selections: Selections, fixtureId: string, outcome: Outcome): Selections {
  const cur = selections[fixtureId] ?? [];
  const next = cur.includes(outcome) ? cur.filter((o) => o !== outcome) : sortOutcomes([...cur, outcome]);
  return { ...selections, [fixtureId]: next };
}

export function sortOutcomes(o: Outcome[]): Outcome[] {
  const order: Record<Outcome, number> = { "1": 0, X: 1, "2": 2 };
  return [...o].sort((a, b) => order[a] - order[b]);
}
