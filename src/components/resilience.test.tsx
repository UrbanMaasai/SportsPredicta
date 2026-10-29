import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ErrorBoundary } from "./ErrorBoundary";
import { Modal } from "./ui/Modal";
import { ResultsModal } from "./modals/ResultsModal";
import { loadRounds, rememberCoupon, saveRoundResults } from "../lib/storage";
import type { Coupon } from "../domain/types";
import { coupon } from "../test/factories";

function Boom(): never {
  throw new Error("kaboom");
}

describe("ErrorBoundary", () => {
  it("shows a recovery screen instead of a blank page", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong");
    expect(screen.getByText("kaboom")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reset session" })).toBeInTheDocument();
    spy.mockRestore();
  });
});

describe("Modal focus trap", () => {
  it("wraps Tab and Shift+Tab inside the dialog", () => {
    render(
      <>
        <button>outside</button>
        <Modal open title="Trap" onClose={() => {}}>
          <button>first inside</button>
          <button>last inside</button>
        </Modal>
      </>,
    );
    const dialog = screen.getByRole("dialog");
    const buttons = within(dialog).getAllByRole("button"); // Close, first, last
    buttons[buttons.length - 1].focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(buttons[0]);
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(buttons[buttons.length - 1]);
  });
});

describe("Fetch results", () => {
  const past = new Date(Date.now() - 86_400_000).toISOString();
  const future = new Date(Date.now() + 86_400_000).toISOString();
  const fx = coupon(13, (i) => ({ id: `f${i}`, source: "live", kickoff: i < 12 ? past : future }));
  const c: Coupon = { kind: "MID13", id: "fetch-1", title: "Fetch test", fixtures: fx, fetchedAt: "" };

  beforeEach(() => localStorage.clear());
  afterEach(() => vi.unstubAllGlobals());

  it("fills only kicked-off legs you haven't entered, plus payouts, and shows sources", async () => {
    rememberCoupon(c);
    saveRoundResults(c.id, { f0: "2" }, {});
    const body = {
      matches: fx.map((_, i) => ({ index: i, homeGoals: 1, awayGoals: 0, status: "FT" })),
      payouts: { "13": 25000 },
      sources: [{ title: "SportPesa results", uri: "https://example.test/results" }],
    };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    render(<ResultsModal open onClose={vi.fn()} kind="MID13" current={c} currentSelections={{}} slips={[]} />);
    await userEvent.click(screen.getByRole("button", { name: "Fetch results" }));

    expect(await screen.findByText(/Filled 11 results and 1 payout/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "SportPesa results" })).toBeInTheDocument();
    const saved = loadRounds()[c.id];
    expect(saved.results.f0).toBe("2"); // your entry is kept
    expect(saved.results.f1).toBe("1");
    expect(saved.results.f12).toBeUndefined(); // not kicked off
    expect(saved.payouts[13]).toBe(25000);
    expect(JSON.parse(String((fetchMock.mock.calls[0] as unknown[])[1] && ((fetchMock.mock.calls[0] as unknown[])[1] as RequestInit).body)).fixtures).toHaveLength(13);
  });

  it("reports server errors", async () => {
    rememberCoupon(c);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "GEMINI_API_KEY is not configured on the server." }), { status: 503 })));
    render(<ResultsModal open onClose={vi.fn()} kind="MID13" current={c} currentSelections={{}} slips={[]} />);
    await userEvent.click(screen.getByRole("button", { name: "Fetch results" }));
    expect(await screen.findByText(/GEMINI_API_KEY is not configured/)).toBeInTheDocument();
  });
});
