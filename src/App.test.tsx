import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";

describe("App", () => {
  beforeEach(() => localStorage.clear());

  it("renders the three-zone top bar with no telemetry badges", () => {
    render(<App />);
    const header = screen.getByRole("banner");
    expect(within(header).getByText("SportsPredicta")).toBeInTheDocument();
    expect(within(header).getByRole("navigation", { name: "View controls" })).toBeInTheDocument();
    expect(within(header).getByRole("button", { name: "Export" })).toBeInTheDocument();
    expect(header.textContent).not.toMatch(/live|online|status|ms\b/i);
  });

  it("switches jackpot and applies the midweek rules", async () => {
    const { container } = render(<App />);
    expect(container.querySelectorAll(".sports-grid tbody tr")).toHaveLength(17);
    await userEvent.click(screen.getAllByRole("button", { name: "Midweek 13" })[0]);
    expect(screen.getByRole("heading", { name: "Midweek Jackpot" })).toBeInTheDocument();
    expect(container.querySelectorAll(".sports-grid tbody tr")).toHaveLength(13);
  });

  it("opens and closes tool modals from the strategy bar", async () => {
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Hedge" }));
    expect(screen.getByRole("dialog", { name: /Hedging/ })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Budget" }));
    expect(screen.getByRole("dialog", { name: /budget/i })).toBeInTheDocument();
  });

  it("persists the session to localStorage", async () => {
    render(<App />);
    await userEvent.click(screen.getAllByRole("button", { name: "Midweek 13" })[0]);
    const saved = JSON.parse(localStorage.getItem("sp.session.v1")!);
    expect(saved.kind).toBe("MID13");
  });

  it("saves a slip locally", async () => {
    render(<App />);
    await userEvent.type(screen.getByRole("textbox", { name: "Slip name" }), "My slip");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(JSON.parse(localStorage.getItem("sp.slips.v1")!)[0].name).toBe("My slip");
  });
});
