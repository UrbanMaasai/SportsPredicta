import type { Fixture, FormResult, Odds } from "./types";
import { enrichFixture } from "./form";

export interface RawFixture {
  home: string;
  away: string;
  league?: string;
  kickoff?: string;
  /** Missing when the source doesn't print odds — SportPesa's jackpot coupon usually doesn't. */
  odds?: Odds;
  homeForm?: FormResult[];
  awayForm?: FormResult[];
}

const SEPARATORS = /\s+(?:vs\.?|v\.?|-|–|—|x)\s+/i;
const VERSUS = /\s+(?:vs\.?|v\.?)\s+/i;
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
    const hasOdds = decimals.length >= 3;
    const dm = line.match(DATE);
    const numbered = /^\s*\d{1,2}[.)]?\s+\S/.test(line);
    // Jackpot coupons are often copied without odds. A line is a fixture if it has odds, says "vs"/"v",
    // or has another team separator plus a leg number or date. Otherwise a short line is a league
    // heading — including "England - Premier League", whose dash is not a fixture separator.
    const isFixture = hasOdds || VERSUS.test(line) || (SEPARATORS.test(line) && (numbered || Boolean(dm)));
    if (!isFixture) {
      if (/[a-z]/i.test(line) && line.length < 60) league = line.replace(/[:]+$/, "");
      continue;
    }
    let kickoff: string | undefined;
    let rest = line;
    if (dm) {
      const day = Number(dm[1]);
      const month = Number(dm[2]) - 1;
      let year = dm[3] ? Number(dm[3]) : now.getFullYear();
      if (year < 100) year += 2000;
      const d = new Date(year, month, day, dm[4] ? Number(dm[4]) : 15, dm[5] ? Number(dm[5]) : 0);
      // No year printed: a coupon in early January copied in late December belongs to next year.
      if (!isNaN(d.getTime())) kickoff = dm[3] ? d.toISOString() : normalizeKickoff(d.toISOString(), now);
      rest = rest.replace(dm[0], " ");
    }
    // Strip odds and the leading leg number, then split teams.
    // Cut at the first price even when there are fewer than three, so stray numbers never end up in a team name.
    const firstOdd = rest.search(DECIMAL);
    rest = (firstOdd >= 0 ? rest.slice(0, firstOdd) : rest).replace(/^\s*\d{1,2}[.)]?\s+/, "").replace(/\s+\d{1,2}:\d{2}\s*$/, "").trim();
    const parts = rest.split(SEPARATORS);
    if (parts.length < 2) continue;
    const homeTeam = parts[0].trim();
    const awayTeam = parts.slice(1).join(" ").trim();
    if (!homeTeam || !awayTeam) continue;
    let odds: Odds | undefined;
    if (hasOdds) {
      const [home, draw, away] = decimals.slice(-3).map(Number);
      if ([home, draw, away].some((o) => !(o > 1))) continue;
      odds = { home, draw, away };
    }
    out.push({ home: homeTeam, away: awayTeam, league, kickoff, odds });
  }
  return out;
}

/** Convert raw fixtures into coupon fixtures, filling kickoff/form where missing. */
export function toFixtures(raw: RawFixture[], source: Fixture["source"], couponId: string, fallbackKickoff: Date): Fixture[] {
  return raw.map((r, i) => {
    const f = enrichFixture({
      id: `${couponId}-${i + 1}`,
      leg: i + 1,
      home: r.home,
      away: r.away,
      league: r.league ?? "—",
      kickoff: r.kickoff ?? new Date(fallbackKickoff.getTime() + i * 30 * 60_000).toISOString(),
      odds: r.odds ?? NEUTRAL_ODDS,
      source,
      homeForm: r.homeForm,
      awayForm: r.awayForm,
    });
    return {
      ...f,
      ...(r.kickoff ? {} : { kickoffEstimated: true }),
      ...(r.odds ? {} : { oddsMissing: true }),
    };
  });
}

/**
 * Placeholder 1-X-2 prices for a fixture whose source printed no odds: a plain, slightly home-leaning
 * spread. Such fixtures are flagged `oddsMissing` and shown without prices until real odds are added.
 */
export const NEUTRAL_ODDS: Odds = { home: 2.5, draw: 3.2, away: 2.9 };

/** Africa/Nairobi is UTC+3 all year (no daylight saving). */
const NAIROBI_OFFSET = "+03:00";

/**
 * Make a kickoff from an AI reader trustworthy:
 * - a date-time with no timezone is Nairobi local time (that is what a SportPesa coupon shows);
 * - a year that is clearly wrong (the model guessed last or next year for a coupon that only prints
 *   day/month) is moved to the nearest year that puts the match within a few weeks of today.
 * Returns an ISO string, or undefined when the value isn't a date.
 */
export function normalizeKickoff(value: unknown, now = new Date()): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  let v = value.trim();
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(v)) v = v.replace(" ", "T") + NAIROBI_OFFSET;
  const t = Date.parse(v);
  if (isNaN(t)) return undefined;
  const d = new Date(t);
  const DAY = 86_400_000;
  const off = Math.abs(t - now.getTime());
  if (off > 120 * DAY) {
    // Try the same day/month in neighbouring years; keep the one closest to now if it lands in a sensible window.
    const candidates = [-1, 0, 1].map((dy) => {
      const c = new Date(d);
      c.setUTCFullYear(now.getUTCFullYear() + dy);
      return c;
    });
    const best = candidates.reduce((a, b) => (Math.abs(b.getTime() - now.getTime()) < Math.abs(a.getTime() - now.getTime()) ? b : a));
    if (best.getTime() > now.getTime() - 7 * DAY && best.getTime() < now.getTime() + 45 * DAY) return best.toISOString();
  }
  return d.toISOString();
}

const normTeam = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]/g, "");

/**
 * Merge fixtures from several reads (e.g. two screenshots of a long coupon, or live search plus a
 * screenshot). Keeps first-seen order, drops repeats of the same match, and lets a later read fill in
 * odds, kickoff or league the earlier one lacked.
 */
export function mergeRaw(...lists: RawFixture[][]): RawFixture[] {
  const out: RawFixture[] = [];
  const index = new Map<string, number>();
  for (const list of lists) {
    for (const f of list) {
      const key = `${normTeam(f.home)}|${normTeam(f.away)}`;
      const at = index.get(key);
      if (at === undefined) {
        index.set(key, out.length);
        out.push({ ...f });
      } else {
        const cur = out[at];
        out[at] = { ...cur, odds: cur.odds ?? f.odds, kickoff: cur.kickoff ?? f.kickoff, league: cur.league ?? f.league };
      }
    }
  }
  return out;
}

const validOdds = (h: number, d: number, a: number) => [h, d, a].every((n) => Number.isFinite(n) && n > 1 && n < 1000);

/** Loose runtime validation for fixtures returned by the AI endpoints. */
export function sanitizeRaw(input: unknown, now = new Date()): RawFixture[] {
  const list = Array.isArray(input) ? input : Array.isArray((input as { fixtures?: unknown })?.fixtures) ? (input as { fixtures: unknown[] }).fixtures : [];
  const form = (v: unknown): FormResult[] | undefined =>
    Array.isArray(v) ? (v.filter((x) => x === "W" || x === "D" || x === "L") as FormResult[]).slice(-5) : undefined;
  const team = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");
  return list.flatMap((x) => {
    const o = (x ?? {}) as Record<string, unknown>;
    const home = team(o.home ?? o.homeTeam);
    const away = team(o.away ?? o.awayTeam);
    if (!home || !away || normTeam(home) === normTeam(away)) return [];
    const odds = (o.odds ?? {}) as Record<string, unknown>;
    const h = Number(odds.home ?? o.odds1 ?? o.homeOdds);
    const d = Number(odds.draw ?? o.oddsX ?? o.drawOdds);
    const a = Number(odds.away ?? o.odds2 ?? o.awayOdds);
    return [{
      home,
      away,
      league: typeof o.league === "string" && o.league.trim() ? o.league.trim() : undefined,
      kickoff: normalizeKickoff(o.kickoff, now),
      // Odds are optional: keep the fixture, flag it, never invent prices.
      odds: validOdds(h, d, a) ? { home: h, draw: d, away: a } : undefined,
      homeForm: form(o.homeForm),
      awayForm: form(o.awayForm),
    }];
  });
}

/**
 * Fill in odds found by a market-odds lookup (`{ odds: [{ index, home, draw, away, bookmaker? }] }`).
 * `targets` maps each lookup position to its index in `raw`. Only fixtures still missing odds are filled,
 * and only with plausible decimal prices.
 */
export function applyLookedUpOdds(raw: RawFixture[], targets: number[], payload: unknown): { raw: RawFixture[]; filled: number } {
  const list = (payload as { odds?: unknown })?.odds;
  const next = raw.map((f) => ({ ...f }));
  let filled = 0;
  for (const item of Array.isArray(list) ? list : []) {
    const o = (item ?? {}) as Record<string, unknown>;
    const at = targets[Number(o.index)];
    const f = at === undefined ? undefined : next[at];
    const [h, d, a] = [Number(o.home), Number(o.draw), Number(o.away)];
    if (!f || f.odds || !validOdds(h, d, a)) continue;
    f.odds = { home: h, draw: d, away: a };
    filled++;
  }
  return { raw: next, filled };
}
