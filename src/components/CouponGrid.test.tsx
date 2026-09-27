import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CouponGrid } from "./CouponGrid";
import { RULES } from "../domain/jackpot";
import { coupon } from "../test/factories";

const fixtures = coupon(17, (i) => ({
  home: `Home${i + 1}`,
  away: `Away${i + 1}`,
  homeForm: i === 2 ? ["W", "L", "L", "L", "L"] : ["W", "D", "W", "L", "W"],
  awayForm: i === 7 ? ["D", "L", "L", "L", "W"] : i === 9 ? ["W", "W", "L", "L", "L"] : ["D", "W", "D", "D", "W"],
}));
const selections = Object.fromEntries(fixtures.map((f) => [f.id, ["1" as const]]));

function setup(onToggle = vi.fn(), onExclude = vi.fn()) {
  const utils = render(
    <CouponGrid fixtures={fixtures} selections={selections} excluded={[]} rules={RULES.MJP17} now={Date.now()} onToggle={onToggle} onExclude={onExclude} onOpenMatch={vi.fn()} />,
  );
  return { ...utils, onToggle, onExclude };
}

describe("CouponGrid slump filter", () => {
  it("renders the Filter by Slump button inside the 5th column header", () => {
    const { container } = setup();
    const th5 = container.querySelector(".sports-grid th:nth-child(5)")!;
    expect(th5).toHaveTextContent("Form");
    const btn = within(th5 as HTMLElement).getByRole("button", { name: /filter by slump/i });
    expect(btn).toHaveAttribute("aria-pressed", "false");
    expect(btn).toHaveTextContent("(2)");
  });

  it("toggles the grid to slump-warning matches only and back", async () => {
    const { container } = setup();
    const rows = () => container.querySelectorAll(".sports-grid tbody tr");
    expect(rows()).toHaveLength(17);
    const btn = container.querySelector<HTMLButtonElement>(".sports-grid th:nth-child(5) button")!;
    await userEvent.click(btn);
    expect(btn).toHaveAttribute("aria-pressed", "true");
    expect(rows()).toHaveLength(2);
    expect(screen.getByText("Home3")).toBeInTheDocument();
    expect(screen.getByText("Away10")).toBeInTheDocument();
    expect(screen.queryByText("Home8")).not.toBeInTheDocument(); // L3 then a win is not a slump
    await userEvent.click(btn);
    expect(rows()).toHaveLength(17);
  });

  it("shows an empty state when no slumps exist", async () => {
    const calm = coupon(13);
    const { container } = render(
      <CouponGrid fixtures={calm} selections={{}} excluded={[]} rules={RULES.MID13} now={Date.now()} onToggle={vi.fn()} onExclude={vi.fn()} onOpenMatch={vi.fn()} />,
    );
    await userEvent.click(container.querySelector<HTMLButtonElement>(".sports-grid th:nth-child(5) button")!);
    expect(screen.getByText(/No matches with a team on a 3\+ loss slump/)).toBeInTheDocument();
  });
});

describe("CouponGrid picks and exclusions", () => {
  it("reports pick toggles with the fixture and outcome", async () => {
    const { onToggle } = setup();
    await userEvent.click(screen.getAllByRole("button", { name: /Leg 1 pick X/ })[0]);
    expect(onToggle).toHaveBeenCalledWith(fixtures[0].id, "X");
  });

  it("marks selected picks as pressed", () => {
    setup();
    expect(screen.getByRole("button", { name: /Leg 1 pick 1/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /Leg 1 pick 2/ })).toHaveAttribute("aria-pressed", "false");
  });

  it("offers exclusion checkboxes only for MJP", () => {
    setup();
    expect(screen.getAllByRole("checkbox")).toHaveLength(17);
    const f13 = coupon(13);
    const { container } = render(
      <CouponGrid fixtures={f13} selections={{}} excluded={[]} rules={RULES.MID13} now={Date.now()} onToggle={vi.fn()} onExclude={vi.fn()} onOpenMatch={vi.fn()} />,
    );
    expect(container.querySelectorAll("input[type=checkbox]")).toHaveLength(0);
  });

  it("disables further exclusions once 4 legs are excluded", () => {
    render(
      <CouponGrid fixtures={fixtures} selections={selections} excluded={fixtures.slice(0, 4).map((f) => f.id)} rules={RULES.MJP17} now={Date.now()} onToggle={vi.fn()} onExclude={vi.fn()} onOpenMatch={vi.fn()} />,
    );
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes.filter((b) => (b as HTMLInputElement).disabled)).toHaveLength(13);
  });
});
