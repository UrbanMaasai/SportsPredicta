import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PortfolioModal } from "./modals/PortfolioModal";
import type { Coupon, Outcome, Slip } from "../domain/types";
import { coupon } from "../test/factories";

const fx = coupon(13, (i) => ({ id: `p${i + 1}` }));
const c: Coupon = { kind: "MID13", id: "cp", title: "T", fixtures: fx, fetchedAt: "" };
const all = (o: Outcome) => Object.fromEntries(fx.map((f) => [f.id, [o]]));
const slip = (id: string, name: string, o: Outcome, couponId = "cp"): Slip => ({
  id, name, kind: "MID13", couponId, strategy: "custom", selections: all(o), excluded: [], createdAt: "", updatedAt: "",
});

describe("PortfolioModal", () => {
  it("combines the current slip with saved slips for this coupon only", () => {
    render(<PortfolioModal open onClose={vi.fn()} coupon={c} currentSelections={all("1")} slips={[slip("s1", "Aways", "2"), slip("s2", "Other coupon", "X", "zz")]} />);
    expect(screen.getByLabelText("Current slip")).toBeChecked();
    expect(screen.getByLabelText("Aways")).toBeChecked();
    expect(screen.queryByLabelText("Other coupon")).not.toBeInTheDocument();
    expect(screen.getByText(/13 legs with uncovered outcomes/)).toBeInTheDocument();
  });

  it("flags duplicates when the same slip is held twice and updates as slips are toggled", async () => {
    render(<PortfolioModal open onClose={vi.fn()} coupon={c} currentSelections={all("1")} slips={[slip("s1", "Homes again", "1")]} />);
    expect(screen.getByText(/duplicate line/)).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText("Homes again"));
    expect(screen.queryByText(/duplicate line/)).not.toBeInTheDocument();
  });
});
