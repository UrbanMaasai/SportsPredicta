import type { Coupon, Fixture, Outcome, Selections } from "./types";
import type { JackpotRules } from "./jackpot";
import { combinations, expandLines, validateSlip } from "./jackpot";
import { oddsFor } from "./odds";

export const SMS_SHORTCODE = "79079";

export interface SmsResult {
  ok: boolean;
  /** One SMS body per line. A single-pick slip produces exactly one. */
  messages: string[];
  errors: string[];
}

/**
 * SportPesa SMS format: `<PREFIX>#<one pick per leg>`, e.g. `MJP#1X21X21X21X21X21X`.
 * SMS accepts one pick per leg, so multi-pick slips are expanded into one SMS per line.
 */
export function formatSms(selections: Selections, fixtures: Fixture[], rules: JackpotRules, maxMessages = 128): SmsResult {
  const errors = validateSlip(selections, fixtures, rules)
    .filter((i) => i.level === "error")
    .map((i) => i.message);
  if (errors.length) return { ok: false, messages: [], errors };
  const lines = combinations(selections, fixtures);
  if (lines > maxMessages) {
    return { ok: false, messages: [], errors: [`${lines} lines would need ${lines} SMS messages (limit ${maxMessages}).`] };
  }
  const messages = expandLines(selections, fixtures).map((line) => `${rules.smsPrefix}#${line.join("")}`);
  return { ok: true, messages, errors: [] };
}

/** Validate a hand-typed SMS code against the coupon. */
export function parseSms(code: string, rules: JackpotRules): { ok: boolean; picks: Outcome[]; error?: string } {
  const m = code.trim().toUpperCase().match(/^([A-Z]+)#([1X2]+)$/);
  if (!m) return { ok: false, picks: [], error: "Expected PREFIX#picks using only 1, X and 2." };
  if (m[1] !== rules.smsPrefix) return { ok: false, picks: [], error: `Prefix must be ${rules.smsPrefix}.` };
  if (m[2].length !== rules.legs) return { ok: false, picks: [], error: `Needs ${rules.legs} picks, got ${m[2].length}.` };
  return { ok: true, picks: m[2].split("") as Outcome[] };
}

const PICK_LABEL: Record<Outcome, string> = { "1": "Home", X: "Draw", "2": "Away" };

export function formatTelegram(
  coupon: Coupon,
  selections: Selections,
  rules: JackpotRules,
  slipName = "Slip",
): string {
  const lines = combinations(selections, coupon.fixtures);
  const rows = coupon.fixtures.map((f) => {
    const picks = selections[f.id] ?? [];
    const flag = picks.length > 1 ? "🔀" : "⚽";
    const odds = picks.map((p) => oddsFor(f.odds, p).toFixed(2)).join("/");
    return `${flag} *${f.leg}.* ${f.home} vs ${f.away} — *${picks.join("/") || "?"}* (${odds || "–"})`;
  });
  const bestOdds = coupon.fixtures.reduce(
    (acc, f) => acc * Math.max(1, ...(selections[f.id] ?? []).map((p) => oddsFor(f.odds, p))),
    1,
  );
  return [
    `🏆 *${rules.name}* — ${slipName}`,
    `📅 ${coupon.title}`,
    "",
    ...rows,
    "",
    `🧮 *Lines:* ${lines} · *Stake:* KES ${(lines * rules.stake).toLocaleString("en-KE")}`,
    `📈 *Combined odds (best line):* ${bestOdds.toFixed(2)}`,
    `📲 SMS to ${SMS_SHORTCODE}`,
  ].join("\n");
}

export function toJson(coupon: Coupon, selections: Selections, rules: JackpotRules, excluded: string[] = []) {
  const lines = combinations(selections, coupon.fixtures);
  return {
    schema: "sportspredicta.coupon/v1",
    jackpot: { kind: rules.kind, name: rules.name, legs: rules.legs, stake: rules.stake },
    coupon: { id: coupon.id, title: coupon.title, fetchedAt: coupon.fetchedAt },
    legs: coupon.fixtures.map((f) => ({
      leg: f.leg,
      home: f.home,
      away: f.away,
      league: f.league,
      kickoff: f.kickoff,
      odds: f.odds,
      picks: selections[f.id] ?? [],
      excluded: excluded.includes(f.id),
    })),
    totals: { lines, cost: lines * rules.stake, currency: "KES" },
    exportedAt: new Date().toISOString(),
  };
}

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(coupon: Coupon, selections: Selections): string {
  const header = ["Leg", "Home", "Away", "League", "Kickoff", "Odds 1", "Odds X", "Odds 2", "Picks"];
  const rows = coupon.fixtures.map((f) =>
    [f.leg, f.home, f.away, f.league, f.kickoff, f.odds.home, f.odds.draw, f.odds.away, (selections[f.id] ?? []).join("/")]
      .map(csvCell)
      .join(","),
  );
  return [header.join(","), ...rows].join("\n");
}

export { PICK_LABEL };
