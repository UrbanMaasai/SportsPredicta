/** Undo/redo timeline of past and future values; the present value lives with the caller. */
export interface Timeline<T> {
  past: T[];
  future: T[];
}

export const HISTORY_LIMIT = 50;

export const emptyTimeline = <T>(): Timeline<T> => ({ past: [], future: [] });

/** Record `previous` before a new edit. Any redo branch is discarded. */
export function record<T>(t: Timeline<T>, previous: T, limit = HISTORY_LIMIT): Timeline<T> {
  return { past: [...t.past, previous].slice(-limit), future: [] };
}

/** Step back: returns the value to restore and the new timeline, or null when there is nothing to undo. */
export function undo<T>(t: Timeline<T>, current: T): { value: T; timeline: Timeline<T> } | null {
  if (t.past.length === 0) return null;
  return { value: t.past[t.past.length - 1], timeline: { past: t.past.slice(0, -1), future: [current, ...t.future] } };
}

export function redo<T>(t: Timeline<T>, current: T): { value: T; timeline: Timeline<T> } | null {
  if (t.future.length === 0) return null;
  return { value: t.future[0], timeline: { past: [...t.past, current], future: t.future.slice(1) } };
}
