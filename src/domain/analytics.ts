import type { Fixture } from "./types";
import { formPoints, momentum } from "./form";
import { impliedProbabilities } from "./odds";
import { goalRates } from "./simulator";

export interface TacticalAxis {
  label: string;
  home: number;
  away: number;
}

const clamp = (v: number) => Math.max(0, Math.min(1, v));

/** Normalised tactical profile for both sides, derived from market prices, form and H2H. */
export function tacticalProfile(f: Fixture): TacticalAxis[] {
  const p = impliedProbabilities(f.odds);
  const g = goalRates(f);
  const h2hHome = f.h2h.length ? f.h2h.filter((m) => m > 0).length / f.h2h.length : 0.5;
  const h2hAway = f.h2h.length ? f.h2h.filter((m) => m < 0).length / f.h2h.length : 0.5;
  return [
    { label: "Attack", home: clamp(g.home / 2.6), away: clamp(g.away / 2.6) },
    { label: "Defence", home: clamp(1 - g.away / 2.6), away: clamp(1 - g.home / 2.6) },
    { label: "Form", home: formPoints(f.homeForm) / 3, away: formPoints(f.awayForm) / 3 },
    { label: "Momentum", home: (momentum(f.homeForm) + 1) / 2, away: (momentum(f.awayForm) + 1) / 2 },
    { label: "Market", home: clamp(p["1"] / 0.8), away: clamp(p["2"] / 0.8) },
    { label: "H2H", home: h2hHome, away: h2hAway },
  ];
}
