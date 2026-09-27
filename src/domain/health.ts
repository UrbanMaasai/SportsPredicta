import type { Fixture, Selections } from "./types";
import type { JackpotRules } from "./jackpot";
import { combinations, countByPicks, validateSlip } from "./jackpot";
import { rankOutcomes } from "./odds";
import { slumpSide } from "./form";
import { slipProbability } from "./strategies";

export interface HealthCheck {
  id: string;
  label: string;
  status: "pass" | "warn" | "fail";
  detail: string;
}

export interface CouponHealth {
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
  checks: HealthCheck[];
  probability: number;
  lines: number;
}

/**
 * Coupon health: rule validity, completeness, line efficiency, slump exposure, and
 * upset concentration, rolled into a 0–100 score.
 */
export function couponHealth(
  selections: Selections,
  fixtures: Fixture[],
  rules: JackpotRules,
  excluded: string[] = [],
): CouponHealth {
  const checks: HealthCheck[] = [];
  const issues = validateSlip(selections, fixtures, rules, excluded);
  const errors = issues.filter((i) => i.level === "error");
  const { empty, doubles, triples } = countByPicks(selections, fixtures);
  const lines = combinations(selections, fixtures);
  const probability = empty > 0 ? 0 : slipProbability(selections, fixtures, excluded);

  checks.push({
    id: "rules",
    label: "Rule compliance",
    status: errors.length === 0 ? "pass" : "fail",
    detail: errors.length === 0 ? "All jackpot rules satisfied." : errors.map((e) => e.message).join(" "),
  });

  checks.push({
    id: "complete",
    label: "Every leg picked",
    status: empty === 0 ? "pass" : "fail",
    detail: empty === 0 ? `${fixtures.length} of ${fixtures.length} legs picked.` : `${empty} leg${empty > 1 ? "s" : ""} still empty.`,
  });

  // Doubles should sit on uncertain legs, not on near-certain favourites.
  const wasted = fixtures.filter((f) => {
    const picks = selections[f.id] ?? [];
    if (picks.length < 2) return false;
    const top = rankOutcomes(f.odds)[0];
    return f.odds[top === "1" ? "home" : top === "2" ? "away" : "draw"] < 1.35;
  });
  checks.push({
    id: "efficiency",
    label: "Double-chance placement",
    status: wasted.length === 0 ? "pass" : "warn",
    detail:
      wasted.length === 0
        ? `${doubles} double${doubles === 1 ? "" : "s"}${triples ? `, ${triples} triple${triples === 1 ? "" : "s"}` : ""} on uncertain legs.`
        : `Legs ${wasted.map((f) => f.leg).join(", ")} double up a sub-1.35 favourite.`,
  });

  const slumpBacked = fixtures.filter((f) => {
    const side = slumpSide(f);
    const picks = selections[f.id] ?? [];
    if (!side || picks.length !== 1) return false;
    return (side !== "away" && picks[0] === "1") || (side !== "home" && picks[0] === "2");
  });
  checks.push({
    id: "slump",
    label: "Slump exposure",
    status: slumpBacked.length === 0 ? "pass" : slumpBacked.length <= 1 ? "warn" : "fail",
    detail:
      slumpBacked.length === 0
        ? "No single pick backs a team on a 3+ loss run."
        : `Legs ${slumpBacked.map((f) => f.leg).join(", ")} back a team on a losing slump.`,
  });

  const upsets = fixtures.filter((f) => {
    const picks = selections[f.id] ?? [];
    return picks.length === 1 && picks[0] !== rankOutcomes(f.odds)[0];
  }).length;
  const upsetShare = fixtures.length ? upsets / fixtures.length : 0;
  checks.push({
    id: "upsets",
    label: "Upset concentration",
    status: upsetShare <= 0.35 ? "pass" : upsetShare <= 0.5 ? "warn" : "fail",
    detail: `${upsets} single pick${upsets === 1 ? "" : "s"} against the market favourite.`,
  });

  const weights: Record<string, number> = { rules: 30, complete: 25, efficiency: 10, slump: 15, upsets: 20 };
  const factor = { pass: 1, warn: 0.5, fail: 0 };
  const score = Math.round(checks.reduce((s, c) => s + weights[c.id] * factor[c.status], 0));
  const grade = score >= 90 ? "A" : score >= 75 ? "B" : score >= 60 ? "C" : score >= 40 ? "D" : "F";
  return { score, grade, checks, probability, lines };
}
