import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Modal } from "./ui/Modal";
import { modalReducer } from "../hooks/useModals";
import { ExportModal } from "./modals/ExportModal";
import { BudgetModal } from "./modals/BudgetModal";
import { RULES } from "../domain/jackpot";
import { coupon } from "../test/factories";

describe("modal state reducer", () => {
  const closed = { open: null, fixtureId: null };

  it("opens and closes a tool modal", () => {
    const s = modalReducer(closed, { type: "open", id: "budget" });
    expect(s.open).toBe("budget");
    expect(modalReducer(s, { type: "close" }).open).toBeNull();
  });

  it("only one modal is open at a time", () => {
    const s = modalReducer(modalReducer(closed, { type: "open", id: "hedge" }), { type: "open", id: "export" });
    expect(s.open).toBe("export");
  });

  it("match detail requires a fixture", () => {
    expect(modalReducer(closed, { type: "open", id: "match" })).toBe(closed);
    const s = modalReducer(closed, { type: "open", id: "match", fixtureId: "f1" });
    expect(s).toEqual({ open: "match", fixtureId: "f1" });
    // remembers the last fixture after closing
    expect(modalReducer(modalReducer(s, { type: "close" }), { type: "open", id: "drift" })).toEqual({ open: "drift", fixtureId: "f1" });
  });
});

describe("Modal", () => {
  it("renders nothing when closed", () => {
    render(<Modal open={false} title="Hidden" onClose={vi.fn()}>body</Modal>);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("is an accessible dialog that closes on Escape and the close button", async () => {
    const onClose = vi.fn();
    render(<Modal open title="Budget" onClose={onClose}>body</Modal>);
    const dlg = screen.getByRole("dialog", { name: "Budget" });
    expect(dlg).toHaveAttribute("aria-modal", "true");
    await userEvent.keyboard("{Escape}");
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe("tool modals", () => {
  const fixtures = coupon(17);
  const c = { kind: "MJP17" as const, id: "c", title: "Test", fixtures, fetchedAt: "" };
  const sel = Object.fromEntries(fixtures.map((f, i) => [f.id, [(["1", "X", "2"] as const)[i % 3]]]));

  it("export modal shows the SMS code and switches formats", async () => {
    render(<ExportModal open onClose={vi.fn()} coupon={c} selections={sel} excluded={[]} rules={RULES.MJP17} slipName="Test" />);
    expect(screen.getByText("MJP#1X21X21X21X21X21X")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "CSV" }));
    expect(screen.getByRole("button", { name: "Download CSV" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Telegram" }));
    expect(screen.getByText(/🏆 \*Mega Jackpot Pro\*/)).toBeInTheDocument();
  });

  it("budget modal applies an optimised slip within budget", async () => {
    const onApply = vi.fn();
    const onClose = vi.fn();
    render(<BudgetModal open onClose={onClose} fixtures={fixtures} rules={RULES.MJP17} onApply={onApply} />);
    const input = screen.getByRole("spinbutton");
    await userEvent.clear(input);
    await userEvent.type(input, "400");
    await userEvent.click(screen.getByRole("button", { name: "Apply to slip" }));
    expect(onApply).toHaveBeenCalledTimes(1);
    const applied = onApply.mock.calls[0][0] as Record<string, string[]>;
    const lines = Object.values(applied).reduce((a, p) => a * p.length, 1);
    expect(lines * 99).toBeLessThanOrEqual(400);
    expect(onClose).toHaveBeenCalled();
  });

  it("budget modal blocks budgets below one stake", async () => {
    render(<BudgetModal open onClose={vi.fn()} fixtures={fixtures} rules={RULES.MJP17} onApply={vi.fn()} />);
    const input = screen.getByRole("spinbutton");
    await userEvent.clear(input);
    await userEvent.type(input, "50");
    expect(screen.getByRole("button", { name: "Apply to slip" })).toBeDisabled();
  });
});
