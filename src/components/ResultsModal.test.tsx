import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ResultsModal } from "./modals/ResultsModal";
import { loadRounds, rememberCoupon } from "../lib/storage";
import type { Coupon, Slip } from "../domain/types";
import { coupon } from "../test/factories";

// Kicked off yesterday, so results can be entered.
const past = new Date(Date.now() - 86_400_000).toISOString();
const fx = coupon(13, (i) => ({ id: `m${i + 1}`, source: "live", home: `H${i + 1}`, away: `A${i + 1}`, kickoff: past }));
const c: Coupon = { kind: "MID13", id: "mid-live-1", title: "Midweek live", fixtures: fx, fetchedAt: "" };
const homes = Object.fromEntries(fx.map((f) => [f.id, ["1" as const]]));
const slip: Slip = {
  id: "s1", kind: "MID13", couponId: c.id, name: "Homes", strategy: "favorites", selections: homes, excluded: [], createdAt: "", updatedAt: "",
};

describe("ResultsModal", () => {
  beforeEach(() => localStorage.clear());

  it("explains what to do when no real coupon is stored", () => {
    render(<ResultsModal open onClose={vi.fn()} kind="MID13" current={c} currentSelections={homes} slips={[]} />);
    expect(screen.getByText(/No real Midweek Jackpot coupons yet/)).toBeInTheDocument();
  });

  it("never stores the sample coupon", () => {
    rememberCoupon({ ...c, fixtures: fx.map((f) => ({ ...f, source: "seed" })) });
    expect(loadRounds()).toEqual({});
  });

  it("grades the current and saved slips as results are pasted, and persists them", async () => {
    rememberCoupon(c);
    render(<ResultsModal open onClose={vi.fn()} kind="MID13" current={c} currentSelections={homes} slips={[slip]} />);
    await userEvent.type(screen.getByLabelText("Paste results"), "1111111111112");
    await userEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(screen.getByText((_, el) => el?.tagName === "P" && el.textContent === "13/13 results entered")).toBeInTheDocument();
    const current = screen.getByText("Current slip").closest("tr")!;
    expect(within(current).getByText("12/13")).toBeInTheDocument();
    expect(within(current).getByText("None")).toBeInTheDocument();
    expect(screen.getByText("Homes")).toBeInTheDocument();
    expect(loadRounds()[c.id].results.m13).toBe("2");
  });

  it("toggles a single result with the 1/X/2 control", async () => {
    rememberCoupon(c);
    render(<ResultsModal open onClose={vi.fn()} kind="MID13" current={c} currentSelections={homes} slips={[]} />);
    const leg1 = screen.getByRole("group", { name: "Result for leg 1" });
    await userEvent.click(within(leg1).getByRole("button", { name: "X" }));
    expect(loadRounds()[c.id].results.m1).toBe("X");
    await userEvent.click(within(leg1).getByRole("button", { name: "X" }));
    expect(loadRounds()[c.id].results.m1).toBeUndefined();
  });

  it("blocks results for fixtures that haven't kicked off", async () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const upcoming: Coupon = { ...c, id: "mid-live-2", fixtures: fx.map((f, i) => ({ ...f, kickoff: i < 12 ? past : future })) };
    rememberCoupon(upcoming);
    render(<ResultsModal open onClose={vi.fn()} kind="MID13" current={upcoming} currentSelections={homes} slips={[]} />);
    expect(within(screen.getByRole("group", { name: "Result for leg 13" })).getByRole("button", { name: "1" })).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Paste results"), "1111111111111");
    await userEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(Object.keys(loadRounds()[upcoming.id].results)).toHaveLength(12);
    expect(screen.getByText(/Skipped 1 result for fixtures that haven’t kicked off/)).toBeInTheDocument();
  });
});
