import type { Coupon, JackpotKind, Selections, Slip, StrategyId } from "../domain/types";
import { pruneHistory, type OddsHistory } from "../domain/drift";
import type { Results } from "../domain/results";

const KEY_SESSION = "sp.session.v1";
const KEY_SLIPS = "sp.slips.v1";
const KEY_ODDS = "sp.odds.v1";
const KEY_ROUNDS = "sp.rounds.v1";
const MAX_ROUNDS = 40;

export interface KindState {
  coupon: Coupon;
  selections: Selections;
  excluded: string[];
  strategy: StrategyId | "custom";
  doubles: number;
}

export interface Session {
  kind: JackpotKind;
  view: string;
  byKind: Partial<Record<JackpotKind, KindState>>;
  savedAt: string;
}

function safeGet<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function safeSet(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable or full: the app keeps working in memory */
  }
}

export function loadSession(): Session | null {
  const s = safeGet<Session>(KEY_SESSION);
  if (!s || typeof s !== "object" || !s.byKind) return null;
  return s;
}

export function saveSession(s: Session): void {
  safeSet(KEY_SESSION, s);
}

export function loadLocalSlips(): Slip[] {
  const s = safeGet<Slip[]>(KEY_SLIPS);
  return Array.isArray(s) ? s : [];
}

export function saveLocalSlip(slip: Slip): Slip[] {
  const all = [slip, ...loadLocalSlips().filter((s) => s.id !== slip.id)].slice(0, 200);
  safeSet(KEY_SLIPS, all);
  return all;
}

export function deleteLocalSlip(id: string): Slip[] {
  const all = loadLocalSlips().filter((s) => s.id !== id);
  safeSet(KEY_SLIPS, all);
  return all;
}

/** Merge local and remote slips; the most recently updated copy wins. */
export function mergeSlips(a: Slip[], b: Slip[]): Slip[] {
  const map = new Map<string, Slip>();
  for (const s of [...a, ...b]) {
    const cur = map.get(s.id);
    if (!cur || cur.updatedAt < s.updatedAt) map.set(s.id, s);
  }
  return [...map.values()].sort((x, y) => (x.updatedAt < y.updatedAt ? 1 : -1));
}

export function loadOddsHistory(): OddsHistory {
  const h = safeGet<OddsHistory>(KEY_ODDS);
  return h && typeof h === "object" ? pruneHistory(h) : {};
}

export function saveOddsHistory(h: OddsHistory): void {
  safeSet(KEY_ODDS, pruneHistory(h));
}

/** A real coupon kept after kickoff so it can be settled, with any results entered for it. */
export interface StoredRound {
  coupon: Coupon;
  results: Results;
  /** Prize per winning line by tier, as published after the round. */
  payouts: Record<number, number>;
  updatedAt: string;
}

export function loadRounds(): Record<string, StoredRound> {
  const r = safeGet<Record<string, StoredRound>>(KEY_ROUNDS);
  return r && typeof r === "object" ? r : {};
}

function saveRounds(rounds: Record<string, StoredRound>): Record<string, StoredRound> {
  // Keep the most recent coupons by first kickoff.
  const kept = Object.entries(rounds)
    .sort(([, a], [, b]) => (b.coupon.fixtures[0]?.kickoff ?? "").localeCompare(a.coupon.fixtures[0]?.kickoff ?? ""))
    .slice(0, MAX_ROUNDS);
  const out = Object.fromEntries(kept);
  safeSet(KEY_ROUNDS, out);
  return out;
}

/** Remember a real (non-sample) coupon so it can be settled after kickoff. Existing results are kept. */
export function rememberCoupon(coupon: Coupon): void {
  if (coupon.fixtures.length === 0 || coupon.fixtures.every((f) => f.source === "seed")) return;
  const rounds = loadRounds();
  const cur = rounds[coupon.id];
  rounds[coupon.id] = { coupon, results: cur?.results ?? {}, payouts: cur?.payouts ?? {}, updatedAt: new Date().toISOString() };
  saveRounds(rounds);
}

export function saveRoundResults(couponId: string, results: Results, payouts: Record<number, number>): Record<string, StoredRound> {
  const rounds = loadRounds();
  const cur = rounds[couponId];
  if (!cur) return rounds;
  rounds[couponId] = { ...cur, results, payouts, updatedAt: new Date().toISOString() };
  return saveRounds(rounds);
}
