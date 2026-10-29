import { useCallback, useEffect, useMemo, useState } from "react";
import type { Coupon, JackpotKind, Outcome, Selections, StrategyId } from "../domain/types";
import { RULES, togglePick } from "../domain/jackpot";
import { isCouponOpen, sampleCoupon } from "../domain/fixtures";
import { buildStrategy } from "../domain/strategies";
import { recordSnapshots } from "../domain/drift";
import { emptyTimeline, record, redo, undo, type Timeline } from "../domain/history";
import { loadOddsHistory, loadSession, rememberCoupon, saveOddsHistory, saveSession, type KindState, type Session } from "../lib/storage";

export type View = "coupon" | "compare" | "consensus" | "insights";

/** The part of a jackpot's state that undo/redo restores. */
type Snap = Pick<KindState, "selections" | "excluded" | "strategy" | "doubles">;
const snap = (s: KindState): Snap => ({ selections: s.selections, excluded: s.excluded, strategy: s.strategy, doubles: s.doubles });

interface Store {
  byKind: Record<JackpotKind, KindState>;
  history: Record<JackpotKind, Timeline<Snap>>;
}

function freshKindState(kind: JackpotKind, now: Date, coupon?: Coupon): KindState {
  const c = coupon ?? sampleCoupon(kind, now);
  return { coupon: c, selections: buildStrategy("balanced", c.fixtures, 0), excluded: [], strategy: "balanced", doubles: 0 };
}

/** Restore the saved session, replacing any coupon that has already kicked off. */
export function restoreSession(saved: Session | null, now = new Date()): Session & { restored: boolean; replaced: JackpotKind[] } {
  const replaced: JackpotKind[] = [];
  const byKind: Partial<Record<JackpotKind, KindState>> = {};
  for (const kind of Object.keys(RULES) as JackpotKind[]) {
    const s = saved?.byKind?.[kind];
    if (s?.coupon && isCouponOpen(s.coupon, now)) byKind[kind] = s;
    else {
      if (s) replaced.push(kind);
      byKind[kind] = freshKindState(kind, now);
    }
  }
  return {
    kind: saved?.kind && saved.kind in RULES ? saved.kind : "MJP17",
    view: saved?.view ?? "coupon",
    byKind,
    savedAt: now.toISOString(),
    restored: Boolean(saved),
    replaced,
  };
}

export function useJackpot() {
  const [init] = useState(() => restoreSession(loadSession()));
  const [kind, setKind] = useState<JackpotKind>(init.kind);
  const [view, setView] = useState<View>(init.view as View);
  const [store, setStore] = useState<Store>(() => ({
    byKind: init.byKind as Record<JackpotKind, KindState>,
    history: { MJP17: emptyTimeline(), MID13: emptyTimeline() },
  }));
  const { byKind, history } = store;

  useEffect(() => {
    saveSession({ kind, view, byKind, savedAt: new Date().toISOString() });
  }, [kind, view, byKind]);

  const state = byKind[kind];
  const rules = RULES[kind];

  /** Edit the active jackpot's picks, recording the previous picks for undo. Pure, so StrictMode-safe. */
  const edit = useCallback(
    (fn: (s: KindState) => KindState) =>
      setStore((st) => {
        const cur = st.byKind[kind];
        const next = fn(cur);
        const changed = JSON.stringify(snap(cur)) !== JSON.stringify(snap(next));
        return {
          byKind: { ...st.byKind, [kind]: next },
          history: changed ? { ...st.history, [kind]: record(st.history[kind], snap(cur)) } : st.history,
        };
      }),
    [kind],
  );

  /** Replace a jackpot's state wholesale (new coupon); its undo history no longer applies. */
  const replace = useCallback(
    (k: JackpotKind, next: KindState) =>
      setStore((st) => ({ byKind: { ...st.byKind, [k]: next }, history: { ...st.history, [k]: emptyTimeline() } })),
    [],
  );

  const step = useCallback(
    (dir: "undo" | "redo") =>
      setStore((st) => {
        const cur = st.byKind[kind];
        const r = (dir === "undo" ? undo : redo)(st.history[kind], snap(cur));
        if (!r) return st;
        return { byKind: { ...st.byKind, [kind]: { ...cur, ...r.value } }, history: { ...st.history, [kind]: r.timeline } };
      }),
    [kind],
  );

  const actions = useMemo(
    () => ({
      toggle: (fixtureId: string, o: Outcome) =>
        edit((s) => ({ ...s, selections: togglePick(s.selections, fixtureId, o), strategy: "custom" })),
      setSelections: (selections: Selections, strategy: StrategyId | "custom" = "custom") =>
        edit((s) => ({ ...s, selections, strategy })),
      applyStrategy: (strategy: StrategyId, doubles: number) =>
        edit((s) => ({ ...s, strategy, doubles, selections: buildStrategy(strategy, s.coupon.fixtures, doubles) })),
      toggleExclude: (fixtureId: string) =>
        edit((s) => ({
          ...s,
          excluded: s.excluded.includes(fixtureId) ? s.excluded.filter((x) => x !== fixtureId) : [...s.excluded, fixtureId],
        })),
      setExcluded: (excluded: string[]) => edit((s) => ({ ...s, excluded })),
      loadCoupon: (coupon: Coupon) => {
        saveOddsHistory(recordSnapshots(loadOddsHistory(), coupon.fixtures));
        rememberCoupon(coupon);
        replace(coupon.kind, freshKindState(coupon.kind, new Date(), coupon));
      },
      /** Load a coupon together with specific picks (e.g. from a shared link). */
      loadSlip: (coupon: Coupon, selections: Selections, excluded: string[]) => {
        rememberCoupon(coupon);
        replace(coupon.kind, { ...freshKindState(coupon.kind, new Date(), coupon), selections, excluded, strategy: "custom" });
      },
      resetSample: () => replace(kind, freshKindState(kind, new Date())),
      restoreSlip: (selections: Selections, excluded: string[], strategy: StrategyId | "custom") =>
        edit((s) => ({ ...s, selections, excluded, strategy })),
      undo: () => step("undo"),
      redo: () => step("redo"),
    }),
    [edit, replace, step, kind],
  );

  const canUndo = history[kind].past.length > 0;
  const canRedo = history[kind].future.length > 0;

  return { kind, setKind, view, setView, state, rules, actions, canUndo, canRedo, restoredNotice: init.replaced };
}
