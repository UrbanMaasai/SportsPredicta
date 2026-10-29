import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../App";
import { MAX_RUNS, loadRuns, mergeRuns, saveRun } from "../lib/storage";
import type { StrategyRun } from "../domain/types";

const run = (id: string, at: string): StrategyRun => ({
  id, at, kind: "MJP17", couponId: "c", couponTitle: "T", strategy: "favorites", doubles: 0, lines: 1, cost: 99, probability: 0.001,
});

describe("strategy history storage", () => {
  beforeEach(() => localStorage.clear());

  it("keeps runs newest first, de-duplicated and capped", () => {
    saveRun(run("a", "2026-01-01"));
    saveRun(run("b", "2026-01-03"));
    saveRun(run("a", "2026-01-01"));
    expect(loadRuns().map((r) => r.id)).toEqual(["b", "a"]);
    const many = Array.from({ length: MAX_RUNS + 5 }, (_, i) => run(`r${i}`, `2026-02-${String(i % 28 + 1).padStart(2, "0")}T${String(i % 24).padStart(2, "0")}:00`));
    expect(mergeRuns(many, [])).toHaveLength(MAX_RUNS);
  });
});

describe("strategy history in the app", () => {
  beforeEach(() => localStorage.clear());

  it("records each Generate and can re-apply it", async () => {
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Bold value" }));
    await userEvent.click(screen.getByRole("button", { name: "Generate" }));
    await userEvent.click(screen.getByRole("button", { name: "Slips" }));
    await userEvent.click(await screen.findByRole("button", { name: /Strategy history \(1\)/ }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Bold value")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Re-apply" })).toBeEnabled();
    expect(loadRuns()[0]).toMatchObject({ kind: "MJP17", strategy: "bold", lines: 1, cost: 99 });
  });

  it("shows an editable prize pool for the single-tier Midweek jackpot", async () => {
    render(<App />);
    await userEvent.click(screen.getAllByRole("button", { name: "Midweek 13" })[0]);
    const panel = screen.getByRole("region", { name: "Prize tiers" });
    expect(within(panel).getByText("Prize pool")).toBeInTheDocument();
    expect(within(panel).queryByText("Excl.")).not.toBeInTheDocument();
    await userEvent.click(within(panel).getByRole("button", { name: "Edit pools" }));
    expect(within(panel).getByRole("spinbutton", { name: "Prize pool for 13 correct" })).toBeInTheDocument();
  });
});
