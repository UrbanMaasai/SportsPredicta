import { describe, expect, it } from "vitest";
import { emptyTimeline, record, redo, undo } from "./history";

describe("undo/redo timeline", () => {
  it("undoes and redoes in order", () => {
    let t = record(record(emptyTimeline<number>(), 1), 2); // values went 1 -> 2 -> 3
    const u1 = undo(t, 3)!;
    expect(u1.value).toBe(2);
    const u2 = undo(u1.timeline, 2)!;
    expect(u2.value).toBe(1);
    expect(undo(u2.timeline, 1)).toBeNull();
    const r1 = redo(u2.timeline, 1)!;
    expect(r1.value).toBe(2);
    t = r1.timeline;
    expect(redo(t, 2)!.value).toBe(3);
  });

  it("a new edit discards the redo branch", () => {
    const u = undo(record(emptyTimeline<string>(), "a"), "b")!;
    const t = record(u.timeline, "a");
    expect(t.future).toEqual([]);
    expect(redo(t, "c")).toBeNull();
  });

  it("caps the history length", () => {
    let t = emptyTimeline<number>();
    for (let i = 0; i < 10; i++) t = record(t, i, 3);
    expect(t.past).toEqual([7, 8, 9]);
  });
});
