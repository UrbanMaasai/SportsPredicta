import { useCallback, useEffect, useMemo, useState } from "react";
import type { Coupon, JackpotKind, Outcome, Selections, StrategyId } from "../domain/types";
import { RULES, togglePick } from "../domain/jackpot";
import { isCouponOpen, sampleCoupon } from "../domain/fixtures";
import { buildStrategy } from "../domain/strategies";
import { loadSession, saveSession, type KindState, type Session } from "../lib/storage";

export type View = "coupon" | "compare" | "consensus" | "insights";

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
  const [byKind, setByKind] = useState(init.byKind as Record<JackpotKind, KindState>);

  useEffect(() => {
    saveSession({ kind, view, byKind, savedAt: new Date().toISOString() });
  }, [kind, view, byKind]);

  const state = byKind[kind];
  const rules = RULES[kind];

  const update = useCallback(
    (fn: (s: KindState) => KindState) => setByKind((all) => ({ ...all, [kind]: fn(all[kind]) })),
    [kind],
  );

  const actions = useMemo(
    () => ({
      toggle: (fixtureId: string, o: Outcome) =>
        update((s) => ({ ...s, selections: togglePick(s.selections, fixtureId, o), strategy: "custom" })),
      setSelections: (selections: Selections, strategy: StrategyId | "custom" = "custom") =>
        update((s) => ({ ...s, selections, strategy })),
      applyStrategy: (strategy: StrategyId, doubles: number) =>
        update((s) => ({ ...s, strategy, doubles, selections: buildStrategy(strategy, s.coupon.fixtures, doubles) })),
      toggleExclude: (fixtureId: string) =>
        update((s) => ({
          ...s,
          excluded: s.excluded.includes(fixtureId) ? s.excluded.filter((x) => x !== fixtureId) : [...s.excluded, fixtureId],
        })),
      setExcluded: (excluded: string[]) => update((s) => ({ ...s, excluded })),
      loadCoupon: (coupon: Coupon) =>
        setByKind((all) => ({ ...all, [coupon.kind]: freshKindState(coupon.kind, new Date(), coupon) })),
      resetSample: () => update(() => freshKindState(kind, new Date())),
      restoreSlip: (selections: Selections, excluded: string[], strategy: StrategyId | "custom") =>
        update((s) => ({ ...s, selections, excluded, strategy })),
    }),
    [update, kind],
  );

  return { kind, setKind, view, setView, state, rules, actions, restoredNotice: init.replaced };
}
