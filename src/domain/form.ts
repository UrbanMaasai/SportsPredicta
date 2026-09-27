import type { Fixture, FormResult } from "./types";
import { impliedProbabilities } from "./odds";
import { hash, rng } from "./random";

export interface Streak {
  result: FormResult;
  length: number;
}

/** Current run at the end of the form string (most recent result last). */
export function currentStreak(form: FormResult[]): Streak | null {
  if (form.length === 0) return null;
  const last = form[form.length - 1];
  let length = 0;
  for (let i = form.length - 1; i >= 0 && form[i] === last; i--) length++;
  return { result: last, length };
}

export const SLUMP_THRESHOLD = 3;

export function inSlump(form: FormResult[], threshold = SLUMP_THRESHOLD): boolean {
  const s = currentStreak(form);
  return s !== null && s.result === "L" && s.length >= threshold;
}

export type SlumpSide = "home" | "away" | "both";

export function slumpSide(f: Fixture, threshold = SLUMP_THRESHOLD): SlumpSide | null {
  const h = inSlump(f.homeForm, threshold);
  const a = inSlump(f.awayForm, threshold);
  if (h && a) return "both";
  if (h) return "home";
  if (a) return "away";
  return null;
}

export function filterSlumps(fixtures: Fixture[], threshold = SLUMP_THRESHOLD): Fixture[] {
  return fixtures.filter((f) => slumpSide(f, threshold) !== null);
}

/** Points per game over the form window (W=3, D=1). */
export function formPoints(form: FormResult[]): number {
  if (form.length === 0) return 0;
  return form.reduce((s, r) => s + (r === "W" ? 3 : r === "D" ? 1 : 0), 0) / form.length;
}

/** Momentum in [-1, 1], weighting recent results more heavily. */
export function momentum(form: FormResult[]): number {
  if (form.length === 0) return 0;
  let num = 0;
  let den = 0;
  form.forEach((r, i) => {
    const w = i + 1;
    num += w * (r === "W" ? 1 : r === "D" ? 0 : -1);
    den += w;
  });
  return num / den;
}

export function streakLabel(form: FormResult[]): string {
  const s = currentStreak(form);
  return s ? `${s.result}${s.length}` : "—";
}

/**
 * Model a plausible five-match form string from market strength when the data source
 * did not supply one. Deterministic per team so it is stable across reloads.
 */
export function modelForm(team: string, strength: number, salt = ""): FormResult[] {
  const r = rng(hash(team + salt));
  const out: FormResult[] = [];
  for (let i = 0; i < 5; i++) {
    const x = r();
    const win = 0.18 + strength * 0.5;
    const draw = 0.26;
    out.push(x < win ? "W" : x < win + draw ? "D" : "L");
  }
  return out;
}

/** Model recent H2H goal margins from the home side's perspective. */
export function modelH2H(f: Pick<Fixture, "home" | "away" | "odds">): number[] {
  const p = impliedProbabilities(f.odds);
  const r = rng(hash(`${f.home}|${f.away}`));
  return Array.from({ length: 6 }, () => {
    const x = r();
    if (x < p["1"]) return 1 + Math.floor(r() * 3);
    if (x < p["1"] + p.X) return 0;
    return -(1 + Math.floor(r() * 3));
  });
}

/** Fill in modelled form/H2H for fixtures whose source did not provide them. */
export function enrichFixture(f: Omit<Fixture, "homeForm" | "awayForm" | "h2h" | "formModelled"> &
  Partial<Pick<Fixture, "homeForm" | "awayForm" | "h2h">>): Fixture {
  const p = impliedProbabilities(f.odds);
  const hasForm = (f.homeForm?.length ?? 0) > 0 && (f.awayForm?.length ?? 0) > 0;
  return {
    ...f,
    homeForm: hasForm ? f.homeForm! : modelForm(f.home, p["1"]),
    awayForm: hasForm ? f.awayForm! : modelForm(f.away, p["2"]),
    h2h: f.h2h && f.h2h.length > 0 ? f.h2h : modelH2H(f),
    formModelled: !hasForm,
  };
}
