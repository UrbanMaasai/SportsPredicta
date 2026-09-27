import type { Fixture, FormResult, Odds } from "../domain/types";

let n = 0;
export function fx(partial: Partial<Fixture> & { odds?: Odds } = {}): Fixture {
  n++;
  return {
    id: partial.id ?? `f${n}`,
    leg: partial.leg ?? n,
    home: partial.home ?? `Home ${n}`,
    away: partial.away ?? `Away ${n}`,
    league: partial.league ?? "Test League",
    kickoff: partial.kickoff ?? new Date(Date.now() + 86_400_000).toISOString(),
    odds: partial.odds ?? { home: 2.1, draw: 3.2, away: 3.6 },
    homeForm: partial.homeForm ?? (["W", "D", "W", "L", "W"] as FormResult[]),
    awayForm: partial.awayForm ?? (["D", "W", "L", "D", "W"] as FormResult[]),
    h2h: partial.h2h ?? [1, 0, -1, 2],
    source: partial.source ?? "seed",
    formModelled: partial.formModelled ?? false,
  };
}

export function coupon(count: number, over: (i: number) => Partial<Fixture> = () => ({})): Fixture[] {
  return Array.from({ length: count }, (_, i) => fx({ id: `c${i + 1}`, leg: i + 1, ...over(i) }));
}
