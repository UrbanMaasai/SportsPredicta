import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CouponGrid } from "./CouponGrid";
import App from "../App";
import { RULES } from "../domain/jackpot";
import { coupon } from "../test/factories";

describe("keyboard picking in the grid", () => {
  const fx = coupon(13, (i) => ({ id: `k${i + 1}`, home: `Home${i + 1}`, away: `Away${i + 1}` }));

  it("toggles picks with 1 / X / 2 on the focused leg and moves with the arrows", () => {
    const onToggle = vi.fn();
    const { container } = render(
      <CouponGrid fixtures={fx} selections={{}} excluded={[]} rules={RULES.MID13} now={Date.now()} onToggle={onToggle} onExclude={vi.fn()} onOpenMatch={vi.fn()} />,
    );
    const rows = container.querySelectorAll<HTMLTableRowElement>("tbody tr[data-fixture]");
    rows[0].focus();
    fireEvent.keyDown(rows[0], { key: "x" });
    expect(onToggle).toHaveBeenLastCalledWith("k1", "X");
    fireEvent.keyDown(rows[0], { key: "ArrowDown" });
    expect(document.activeElement).toBe(rows[1]);
    fireEvent.keyDown(rows[1], { key: "2" });
    expect(onToggle).toHaveBeenLastCalledWith("k2", "2");
    fireEvent.keyDown(rows[1], { key: "ArrowUp" });
    expect(document.activeElement).toBe(rows[0]);
  });

  it("ignores pick keys with modifiers held", () => {
    const onToggle = vi.fn();
    const { container } = render(
      <CouponGrid fixtures={fx} selections={{}} excluded={[]} rules={RULES.MID13} now={Date.now()} onToggle={onToggle} onExclude={vi.fn()} onOpenMatch={vi.fn()} />,
    );
    const row = container.querySelector<HTMLTableRowElement>("tbody tr[data-fixture]")!;
    fireEvent.keyDown(row, { key: "1", ctrlKey: true });
    expect(onToggle).not.toHaveBeenCalled();
  });
});

describe("undo / redo", () => {
  beforeEach(() => localStorage.clear());

  it("undoes and redoes pick changes with the buttons and shortcuts", async () => {
    render(<App />);
    const undoBtn = screen.getByRole("button", { name: "Undo" });
    const redoBtn = screen.getByRole("button", { name: "Redo" });
    expect(undoBtn).toBeDisabled();
    const pick = screen.getAllByRole("button", { name: /^Leg 1 pick X/ })[0];
    const before = pick.getAttribute("aria-pressed");
    await userEvent.click(pick);
    expect(pick.getAttribute("aria-pressed")).not.toBe(before);
    expect(undoBtn).toBeEnabled();

    fireEvent.keyDown(document.body, { key: "z", ctrlKey: true });
    expect(screen.getAllByRole("button", { name: /^Leg 1 pick X/ })[0].getAttribute("aria-pressed")).toBe(before);
    expect(redoBtn).toBeEnabled();

    await userEvent.click(redoBtn);
    expect(screen.getAllByRole("button", { name: /^Leg 1 pick X/ })[0].getAttribute("aria-pressed")).not.toBe(before);
  });

  it("does not hijack Ctrl+Z inside text fields", async () => {
    render(<App />);
    await userEvent.click(screen.getAllByRole("button", { name: /^Leg 1 pick X/ })[0]);
    const field = screen.getByRole("textbox", { name: "Slip name" });
    fireEvent.keyDown(field, { key: "z", ctrlKey: true });
    expect(screen.getByRole("button", { name: "Undo" })).toBeEnabled();
  });
});
