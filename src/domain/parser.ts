import type { Fixture, FormResult, Odds } from "./types";
import { enrichFixture } from "./form";

export interface RawFixture {
  home: string;
  away: string;
  league?: string;
  kickoff?: string;
  odds: Odds;
  homeForm?: FormResult[];
  awayForm?: FormResult[];
}

const SEPARATORS = /\s+(?:vs\.?|v\.?|-|–|—|x)\s+/i;
const DECIMAL = /\b\d{1,3}\.\d{1,2}\b/g;
const DATE = /\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?(?:\s+(\d{1,2}):(\d{2}))?\b/;

/**
 * Parse copied coupon tables. Accepts one fixture per line with teams separated by
 * "vs", "v" or a dash and three decimal odds (1, X, 2). An optional leading leg number,
 * date (dd/mm[/yyyy] [hh:mm], also with dashes) and tab/pipe-separated columns are tolerated.
 */
export function parseCouponText(text: string, now = new Date()): RawFixture[] {
  const out: RawFixture[] = [];
  let league: string | undefined;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/[|\t]+/g, " ").replace(/\s{2,}/g, " ").trim();
    if (!line) continue;
    const decimals = line.match(DECIMAL) ?? [];
    if (decimals.length < 3) {
      // A line without odds may be a league heading.
      if (/[a-z]/i.test(line) && !SEPARATORS.test(line) && line.length < 60) league = line.replace(/[:]+$/, "");
      continue;
    }
    const [home, draw, away] = decimals.slice(-3).map(Number);
    let kickoff: string | undefined;
    let rest = line;
    const dm = rest.match(DATE);
    if (dm) {
      const day = Number(dm[1]);
      const month = Number(dm[2]) - 1;
      let year = dm[3] ? Number(dm[3]) : now.getFullYear();
      if (year < 100) year += 2000;
      const d = new Date(year, month, day, dm[4] ? Number(dm[4]) : 15, dm[5] ? Number(dm[5]) : 0);
      if (!isNaN(d.getTime())) kickoff = d.toISOString();
      rest = rest.replace(dm[0], " ");
    }
    // Strip odds and leading leg number, then split teams.
    const firstOdd = rest.search(DECIMAL);
    rest = (firstOdd >= 0 ? rest.slice(0, firstOdd) : rest).replace(/^\s*\d{1,2}[.)]?\s+/, "").trim();
    const parts = rest.split(SEPARATORS);
    if (parts.length < 2) continue;
    const homeTeam = parts[0].trim();
    const awayTeam = parts.slice(1).join(" ").trim();
    if (!homeTeam || !awayTeam) continue;
    if ([home, draw, away].some((o) => !(o > 1))) continue;
    out.push({ home: homeTeam, away: awayTeam, league, kickoff, odds: { home, draw, away } });
  }
  return out;
}

/** Convert raw fixtures into coupon fixtures, filling kickoff/form where missing. */
export function toFixtures(raw: RawFixture[], source: Fixture["source"], couponId: string, fallbackKickoff: Date): Fixture[] {
  return raw.map((r, i) =>
    enrichFixture({
      id: `${couponId}-${i + 1}`,
      leg: i + 1,
      home: r.home,
      away: r.away,
      league: r.league ?? "—",
      kickoff: r.kickoff ?? new Date(fallbackKickoff.getTime() + i * 30 * 60_000).toISOString(),
      odds: r.odds,
      source,
      homeForm: r.homeForm,
      awayForm: r.awayForm,
    }),
  );
}

/** Loose runtime validation for fixtures returned by the AI endpoints. */
export function sanitizeRaw(input: unknown): RawFixture[] {
  if (!Array.isArray(input)) return [];
  const form = (v: unknown): FormResult[] | undefined =>
    Array.isArray(v) ? (v.filter((x) => x === "W" || x === "D" || x === "L") as FormResult[]).slice(-5) : undefined;
  return input.flatMap((x) => {
    const o = x as Record<string, unknown>;
    const odds = (o.odds ?? {}) as Record<string, unknown>;
    const home = Number(odds.home ?? o.odds1 ?? o.homeOdds);
    const draw = Number(odds.draw ?? o.oddsX ?? o.drawOdds);
    const away = Number(odds.away ?? o.odds2 ?? o.awayOdds);
    if (typeof o.home !== "string" || typeof o.away !== "string") return [];
    if (![home, draw, away].every((n) => Number.isFinite(n) && n > 1)) return [];
    const kickoff = typeof o.kickoff === "string" && !isNaN(Date.parse(o.kickoff)) ? new Date(o.kickoff).toISOString() : undefined;
    return [{
      home: o.home.trim(),
      away: o.away.trim(),
      league: typeof o.league === "string" ? o.league : undefined,
      kickoff,
      odds: { home, draw, away },
      homeForm: form(o.homeForm),
      awayForm: form(o.awayForm),
    }];
  });
}
