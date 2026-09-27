import type { Coupon, Fixture, JackpotKind, Odds } from "./types";
import { RULES } from "./jackpot";
import { enrichFixture } from "./form";
import { hash, rng } from "./random";

interface TeamPool {
  league: string;
  teams: [string, number][]; // name, strength 0..1
}

const POOLS: TeamPool[] = [
  { league: "England · Premier League", teams: [["Arsenal", 0.86], ["Man City", 0.88], ["Liverpool", 0.87], ["Chelsea", 0.74], ["Newcastle", 0.7], ["Aston Villa", 0.68], ["Tottenham", 0.66], ["Brighton", 0.6], ["Fulham", 0.52], ["Brentford", 0.5], ["Everton", 0.44], ["Wolves", 0.4]] },
  { league: "England · Championship", teams: [["Leeds", 0.62], ["Sunderland", 0.56], ["Middlesbrough", 0.52], ["Norwich", 0.5], ["Coventry", 0.5], ["West Brom", 0.48], ["Hull City", 0.42], ["Stoke City", 0.4], ["QPR", 0.38], ["Preston", 0.4]] },
  { league: "Spain · La Liga", teams: [["Real Madrid", 0.88], ["Barcelona", 0.86], ["Atletico Madrid", 0.78], ["Athletic Club", 0.66], ["Real Sociedad", 0.6], ["Villarreal", 0.6], ["Betis", 0.56], ["Sevilla", 0.5], ["Getafe", 0.42], ["Osasuna", 0.44]] },
  { league: "Italy · Serie A", teams: [["Inter", 0.84], ["Napoli", 0.78], ["Juventus", 0.76], ["AC Milan", 0.74], ["Atalanta", 0.72], ["Roma", 0.66], ["Lazio", 0.62], ["Bologna", 0.58], ["Torino", 0.48], ["Genoa", 0.42]] },
  { league: "Germany · Bundesliga", teams: [["Bayern Munich", 0.88], ["Leverkusen", 0.78], ["Dortmund", 0.74], ["RB Leipzig", 0.72], ["Stuttgart", 0.64], ["Frankfurt", 0.62], ["Freiburg", 0.54], ["Wolfsburg", 0.48], ["Mainz", 0.46], ["Augsburg", 0.42]] },
  { league: "France · Ligue 1", teams: [["PSG", 0.88], ["Marseille", 0.7], ["Monaco", 0.68], ["Lille", 0.64], ["Lyon", 0.62], ["Nice", 0.58], ["Lens", 0.56], ["Rennes", 0.54], ["Nantes", 0.42], ["Toulouse", 0.46]] },
  { league: "Netherlands · Eredivisie", teams: [["PSV", 0.8], ["Ajax", 0.72], ["Feyenoord", 0.74], ["AZ Alkmaar", 0.62], ["Twente", 0.58], ["Utrecht", 0.54], ["Heerenveen", 0.42], ["Sparta Rotterdam", 0.4]] },
  { league: "Portugal · Primeira Liga", teams: [["Benfica", 0.8], ["Porto", 0.78], ["Sporting CP", 0.8], ["Braga", 0.66], ["Guimaraes", 0.56], ["Famalicao", 0.46], ["Rio Ave", 0.42], ["Boavista", 0.38]] },
];

/** Bookmaker-style 1X2 odds from team strengths with ~7% margin. */
export function oddsFromStrength(home: number, away: number, jitter: number): Odds {
  const diff = home - away + 0.08; // home advantage
  const pHomeRaw = 1 / (1 + Math.exp(-4.2 * diff));
  const pDraw = Math.max(0.2, 0.3 - Math.abs(diff) * 0.22) + (jitter - 0.5) * 0.03;
  const pHome = (1 - pDraw) * pHomeRaw;
  const pAway = 1 - pDraw - pHome;
  const margin = 1.07;
  const round = (p: number) => Math.max(1.05, Math.round((1 / (p * margin)) * 100) / 100);
  return { home: round(pHome), draw: round(pDraw), away: round(pAway) };
}

/** Next date on/after `from` whose weekday is in `weekdays` (0 = Sunday). */
export function nextWeekday(from: Date, weekday: number): Date {
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  const delta = (weekday - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + delta);
  return d;
}

/**
 * Kickoff slots for the next upcoming coupon. MJP: Saturday + Sunday. Midweek: Tuesday + Wednesday.
 * If the first slot of this week has already passed, roll forward a week so every fixture is upcoming.
 */
export function upcomingSlots(kind: JackpotKind, now: Date): Date[] {
  const legs = RULES[kind].legs;
  const [dayA, dayB] = kind === "MJP17" ? [6, 0] : [2, 3];
  const build = (base: Date) => {
    const a = nextWeekday(base, dayA);
    const b = new Date(a);
    b.setDate(a.getDate() + ((dayB - dayA + 7) % 7 || 7));
    const hours = [14, 16, 17, 19, 21];
    const slots: Date[] = [];
    for (let i = 0; i < legs; i++) {
      const day = i < Math.ceil(legs * 0.6) ? a : b;
      const s = new Date(day);
      s.setHours(hours[i % hours.length], i % 3 === 0 ? 0 : 30, 0, 0);
      slots.push(s);
    }
    return slots.sort((x, y) => x.getTime() - y.getTime());
  };
  let slots = build(now);
  if (slots[0].getTime() <= now.getTime()) {
    const next = new Date(now);
    next.setDate(now.getDate() + 1);
    slots = build(next);
    // A same-week Sunday slot could still precede "now" after rolling; guarantee future-only.
    while (slots[0].getTime() <= now.getTime()) {
      next.setDate(next.getDate() + 1);
      slots = build(next);
    }
  }
  return slots;
}

/** ISO week key for deterministic seeding, e.g. "2026-W39". */
export function weekKey(d: Date): string {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/**
 * Sample coupon anchored to the current calendar so kickoffs are always in the future.
 * Used until live fixtures are loaded; clearly labelled as a sample in the UI.
 */
export function sampleCoupon(kind: JackpotKind, now = new Date()): Coupon {
  const slots = upcomingSlots(kind, now);
  const key = `${kind}-${weekKey(slots[0])}`;
  const r = rng(hash(key));
  const used = new Set<string>();
  const fixtures: Fixture[] = slots.map((slot, i) => {
    let pool: TeamPool;
    let home: [string, number];
    let away: [string, number];
    do {
      pool = POOLS[Math.floor(r() * POOLS.length)];
      home = pool.teams[Math.floor(r() * pool.teams.length)];
      away = pool.teams[Math.floor(r() * pool.teams.length)];
    } while (home[0] === away[0] || used.has(home[0]) || used.has(away[0]));
    used.add(home[0]);
    used.add(away[0]);
    const odds = oddsFromStrength(home[1], away[1], r());
    return enrichFixture({
      id: `${key}-${i + 1}`,
      leg: i + 1,
      home: home[0],
      away: away[0],
      league: pool.league,
      kickoff: slot.toISOString(),
      odds,
      source: "seed",
    });
  });
  return {
    kind,
    id: key,
    title: `${RULES[kind].name} · ${weekKey(slots[0])}`,
    fixtures,
    fetchedAt: now.toISOString(),
  };
}

/** Drop fixtures that have already kicked off, then re-number legs. */
export function upcomingOnly(fixtures: Fixture[], now = new Date()): Fixture[] {
  return fixtures
    .filter((f) => new Date(f.kickoff).getTime() > now.getTime())
    .map((f, i) => ({ ...f, leg: i + 1 }));
}

export function countdown(kickoff: string, now: number): string {
  const ms = new Date(kickoff).getTime() - now;
  if (ms <= 0) return "Started";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return d > 0 ? `${d}d ${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(h)}:${pad(m)}:${pad(sec)}`;
}

/** A coupon is open for betting until its first kickoff. */
export function isCouponOpen(coupon: Coupon, now = new Date()): boolean {
  return coupon.fixtures.length > 0 && coupon.fixtures.every((f) => new Date(f.kickoff).getTime() > now.getTime());
}
