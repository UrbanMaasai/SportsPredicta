import type { Coupon, JackpotKind, Selections, Slip, StrategyId } from "../domain/types";
import { pruneHistory, type OddsHistory } from "../domain/drift";

const KEY_SESSION = "sp.session.v1";
const KEY_SLIPS = "sp.slips.v1";
const KEY_ODDS = "sp.odds.v1";

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
