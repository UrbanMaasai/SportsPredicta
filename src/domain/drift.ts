import type { Fixture, Odds } from "./types";
import { hash, rng } from "./random";

export interface OddsSnapshot {
  at: string;
  odds: Odds;
  /** True for recorded observations, false for modelled backfill. */
  observed: boolean;
}

export const PUBLICATION_LEAD_DAYS = 5;

/**
 * Modelled path from publication to now: a Brownian bridge in log-odds ending exactly at the
 * current price. Observed snapshots, when available, replace the modelled points.
 */
export function modelDrift(f: Fixture, now = new Date(), points = 24): OddsSnapshot[] {
  const kickoff = new Date(f.kickoff).getTime();
  const end = Math.min(now.getTime(), kickoff);
  // Coupons are published days ahead; never let the modelled publication date sit in the future.
  const start = Math.min(kickoff - PUBLICATION_LEAD_DAYS * 86_400_000, end - 2 * 86_400_000);
  if (end <= start) return [{ at: new Date(end).toISOString(), odds: f.odds, observed: true }];
  const r = rng(hash(`drift|${f.id}`));
  const keys: (keyof Odds)[] = ["home", "draw", "away"];
  const walks = keys.map(() => {
    const steps = [(r() - 0.5) * 0.16]; // opening price differs from the current one
    for (let i = 1; i < points; i++) steps.push(steps[i - 1] + (r() - 0.5) * 0.06);
    const last = steps[points - 1];
    return steps.map((s, i) => s - (last * i) / (points - 1)); // pin to 0 at the end
  });
  return Array.from({ length: points }, (_, i) => {
    const t = start + ((end - start) * i) / (points - 1);
    const odds = Object.fromEntries(
      keys.map((k, j) => [k, Math.max(1.01, Math.round(f.odds[k] * Math.exp(walks[j][i]) * 100) / 100)]),
    ) as unknown as Odds;
    return { at: new Date(t).toISOString(), odds, observed: i === points - 1 };
  });
}

export function mergeSnapshots(modelled: OddsSnapshot[], observed: OddsSnapshot[]): OddsSnapshot[] {
  if (observed.length === 0) return modelled;
  const firstObs = Math.min(...observed.map((s) => new Date(s.at).getTime()));
  return [...modelled.filter((s) => new Date(s.at).getTime() < firstObs && !s.observed), ...observed].sort(
    (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime(),
  );
}

export interface DriftSummary {
  opening: Odds;
  current: Odds;
  /** Percent change per outcome; negative = shortened (money came in). */
  change: Odds;
  steamed: keyof Odds | null;
}

export function summarizeDrift(series: OddsSnapshot[]): DriftSummary {
  const opening = series[0].odds;
  const current = series[series.length - 1].odds;
  const pct = (a: number, b: number) => ((b - a) / a) * 100;
  const change = { home: pct(opening.home, current.home), draw: pct(opening.draw, current.draw), away: pct(opening.away, current.away) };
  const min = (Object.keys(change) as (keyof Odds)[]).reduce((a, b) => (change[b] < change[a] ? b : a));
  return { opening, current, change, steamed: change[min] <= -5 ? min : null };
}
