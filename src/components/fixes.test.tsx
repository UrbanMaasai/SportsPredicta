import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import App from "../App";
import { CouponGrid } from "./CouponGrid";
import { RULES } from "../domain/jackpot";
import { parseCouponText, toFixtures } from "../domain/parser";
import { decodeShare, encodeShare } from "../domain/share";
import { applyFetchedResults } from "../domain/results";
import type { Coupon } from "../domain/types";

describe("strategy bar follows the slip", () => {
  beforeEach(() => localStorage.clear());

  it("shows the restored strategy and doubles after undo", async () => {
    render(<App />);
    const doubles = () => screen.getAllByRole("spinbutton")[0] as HTMLInputElement;
    const pressed = () => within(screen.getByRole("group", { name: "Strategy" })).getByRole("button", { pressed: true }).textContent;

    await userEvent.click(screen.getByRole("button", { name: "Bold value" }));
    await userEvent.clear(doubles());
    await userEvent.type(doubles(), "2");
    await userEvent.click(screen.getByRole("button", { name: "Generate" }));
    await userEvent.click(screen.getByRole("button", { name: "Favorites" }));
    await userEvent.clear(doubles());
    await userEvent.type(doubles(), "0");
    await userEvent.click(screen.getByRole("button", { name: "Generate" }));
    expect(pressed()).toBe("Favorites");

    await userEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(pressed()).toBe("Bold value");
    expect(doubles().value).toBe("2");
  });
});

describe("estimated kickoff times", () => {
  const raw = parseCouponText("Arsenal vs Chelsea 1.85 3.40 4.20\nInter vs Roma 05/12/2030 18:00 2.10 3.30 3.50");
  const fx = toFixtures(raw, "text", "cp", new Date("2030-12-01T12:00:00Z"));

  it("flags fixtures whose source had no time", () => {
    expect(fx[0].kickoffEstimated).toBe(true);
    expect(fx[1].kickoffEstimated).toBeUndefined();
  });

  it("shows Time TBC instead of a made-up countdown", () => {
    render(<CouponGrid fixtures={fx} selections={{}} excluded={[]} rules={RULES.MID13} now={Date.now()} onToggle={vi.fn()} onExclude={vi.fn()} onOpenMatch={vi.fn()} />);
    const rows = screen.getAllByRole("row").slice(1);
    expect(within(rows[0]).getByText("Time TBC")).toBeInTheDocument();
    expect(within(rows[1]).queryByText("Time TBC")).not.toBeInTheDocument();
  });

  it("survives a share link round-trip", () => {
    const thirteen = toFixtures(Array.from({ length: 13 }, (_, i) => ({ ...raw[i % 2], home: `H${i}` })), "text", "c13", new Date("2030-12-01T12:00:00Z"));
    const c: Coupon = { kind: "MID13", id: "c13", title: "T", fixtures: thirteen, fetchedAt: "" };
    const d = decodeShare(encodeShare(c, {}));
    expect(d.coupon.fixtures.map((f) => Boolean(f.kickoffEstimated))).toEqual(thirteen.map((f) => Boolean(f.kickoffEstimated)));
  });

  it("accepts fetched results for estimated fixtures even if the placeholder is in the future", () => {
    const future = [{ ...fx[0], kickoff: "2099-01-01T00:00:00Z" }];
    const got = applyFetchedResults({ matches: [{ index: 0, homeGoals: 1, awayGoals: 0, status: "FT" }] }, future, [13]);
    expect(Object.values(got.results)).toEqual(["1"]);
  });
});

describe("coupon closes while the app is open", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.useRealTimers());

  it("warns once the first match kicks off", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<App />);
    expect(screen.queryByText(/This coupon has closed/)).not.toBeInTheDocument();
    const firstKickoff = JSON.parse(localStorage.getItem("sp.session.v1")!).byKind.MJP17.coupon.fixtures[0].kickoff;
    vi.setSystemTime(new Date(new Date(firstKickoff).getTime() + 60_000));
    await act(async () => {
      vi.advanceTimersByTime(1100);
    });
    expect(screen.getByText(/This coupon has closed/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Import next round" })).toBeInTheDocument();
  });
});

describe("palette contrast (WCAG AA)", () => {
  const css = readFileSync("src/index.css", "utf8");
  const token = (name: string) => css.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`))![1];
  const lum = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a: string, b: string) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };

  it.each(["ink", "ink-2", "ink-3", "accent", "warn", "bad", "good"])("%s text meets 4.5:1 on surface, canvas and sunken", (name) => {
    for (const bg of ["surface", "canvas", "sunken"]) {
      // warn/bad/good/accent are only used on surface and canvas
      if (bg === "sunken" && !["ink", "ink-2", "ink-3"].includes(name)) continue;
      expect(ratio(token(name), token(bg)), `${name} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});
