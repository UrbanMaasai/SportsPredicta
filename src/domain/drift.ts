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
export function modelDrift(
  f: Fixture,
  now = new Date(),
  points = 24,
  /** Price the path must end on; defaults to the fixture's current odds. */
  anchor: Odds = f.odds,
): OddsSnapshot[] {
  const kickoff = new Date(f.kickoff).getTime();
  const end = Math.min(now.getTime(), kickoff);
  // Coupons are published days ahead; never let the modelled publication date sit in the future.
  const start = Math.min(kickoff - PUBLICATION_LEAD_DAYS * 86_400_000, end - 2 * 86_400_000);
  if (end <= start) return [{ at: new Date(end).toISOString(), odds: anchor, observed: true }];
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
      keys.map((k, j) => [k, Math.max(1.01, Math.round(anchor[k] * Math.exp(walks[j][i]) * 100) / 100)]),
    ) as unknown as Odds;
    return { at: new Date(t).toISOString(), odds, observed: i === points - 1 };
  });
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

// ---------- Observed price history ----------

/** Observed snapshots per fixture, keyed by {@link fixtureKey}. */
export type OddsHistory = Record<string, { kickoff: string; snapshots: OddsSnapshot[] }>;

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]/g, "");

/**
 * Stable identity for a fixture across imports: teams plus kickoff day. Coupon and fixture ids
 * change on every import, so they cannot link snapshots of the same match.
 */
export function fixtureKey(f: Pick<Fixture, "home" | "away" | "kickoff">): string {
  return `${norm(f.home)}|${norm(f.away)}|${f.kickoff.slice(0, 10)}`;
}

const sameOdds = (a: Odds, b: Odds) => a.home === b.home && a.draw === b.draw && a.away === b.away;

/**
 * Record the current prices of real (non-sample) fixtures. A snapshot is only appended when
 * the price changed since the last observation, so repeated imports do not pad the history.
 */
export function recordSnapshots(history: OddsHistory, fixtures: Fixture[], at = new Date()): OddsHistory {
  const next: OddsHistory = { ...history };
  for (const f of fixtures) {
    if (f.source === "seed") continue;
    const key = fixtureKey(f);
    const entry = next[key] ?? { kickoff: f.kickoff, snapshots: [] };
    const last = entry.snapshots.at(-1);
    if (last && sameOdds(last.odds, f.odds)) continue;
    next[key] = { kickoff: f.kickoff, snapshots: [...entry.snapshots, { at: at.toISOString(), odds: f.odds, observed: true }] };
  }
  return next;
}

/** Drop fixtures that kicked off more than `days` ago. */
export function pruneHistory(history: OddsHistory, now = new Date(), days = 7): OddsHistory {
  const cutoff = now.getTime() - days * 86_400_000;
  return Object.fromEntries(Object.entries(history).filter(([, e]) => new Date(e.kickoff).getTime() >= cutoff));
}

/**
 * Full timeline for a fixture: observed snapshots where recorded, with a modelled path before
 * the first observation that ends exactly on that first observed price.
 */
export function driftSeries(f: Fixture, observed: OddsSnapshot[] = [], now = new Date()): OddsSnapshot[] {
  if (observed.length === 0) return modelDrift(f, now);
  const obs = [...observed].sort((a, b) => a.at.localeCompare(b.at));
  const modelled = modelDrift(f, new Date(obs[0].at), 24, obs[0].odds).slice(0, -1);
  const series = [...modelled, ...obs];
  const last = series.at(-1)!;
  if (!sameOdds(last.odds, f.odds)) series.push({ at: now.toISOString(), odds: f.odds, observed: true });
  return series;
}
