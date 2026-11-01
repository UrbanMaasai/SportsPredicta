import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ImportModal } from "./modals/ImportModal";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const soon = new Date(Date.now() + 3 * 86_400_000);
const kickoffAt = (h: number) => new Date(soon.getTime() + h * 3_600_000).toISOString().replace(/\.\d+Z$/, "+00:00");
// What Gemini returns for one phone screenshot of a jackpot coupon: teams and times, no odds.
const shot = (from: number, to: number) => ({ fixtures: Array.from({ length: to - from }, (_, k) => ({ home: `Home ${from + k}`, away: `Away ${from + k}`, kickoff: kickoffAt(from + k) })) });
const png = (name: string) => new File([new Uint8Array([137, 80, 78, 71])], name, { type: "image/png" });

describe("Import dialog", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("merges several screenshots of a long coupon, then loads it", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json(shot(0, 9)))
      .mockResolvedValueOnce(json(shot(8, 17))); // overlaps row 8
    vi.stubGlobal("fetch", fetchMock);
    const onLoad = vi.fn();
    render(<ImportModal open onClose={vi.fn()} kind="MJP17" onLoad={onLoad} />);
    await userEvent.click(screen.getByRole("button", { name: "Screenshots" }));
    await userEvent.upload(screen.getByLabelText("Coupon screenshots"), [png("top.png"), png("bottom.png")]);

    expect(await screen.findByText(/2 screenshots \(9 \+ 9 rows\): 18 matches read, 17 new, 1 already listed/)).toBeInTheDocument();
    expect(screen.getByText("17 of 17")).toBeInTheDocument();
    expect(screen.getByText((_, el) => el?.tagName === "SPAN" && /^17 fixtures have no odds/.test(el.textContent ?? ""))).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Load 17 fixtures" }));
    const coupon = onLoad.mock.calls[0][0];
    expect(coupon.fixtures).toHaveLength(17);
    expect(coupon.fixtures.every((f: { oddsMissing?: boolean }) => f.oddsMissing)).toBe(true);
  });

  it("says how many are missing after one screenshot and lets you add more later", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(json(shot(0, 8))).mockResolvedValueOnce(json(shot(8, 17))));
    render(<ImportModal open onClose={vi.fn()} kind="MJP17" onLoad={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Screenshots" }));
    await userEvent.upload(screen.getByLabelText("Coupon screenshots"), png("top.png"));
    expect(await screen.findByText("8 of 17")).toBeInTheDocument();
    expect(screen.getByText(/9 more needed/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Load 17 fixtures" })).toBeDisabled();
    await userEvent.upload(screen.getByLabelText("Coupon screenshots"), png("bottom.png"));
    expect(await screen.findByText("17 of 17")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Load 17 fixtures" })).toBeEnabled();
  });

  it("finds market odds for fixtures without them", async () => {
    const odds = { odds: Array.from({ length: 13 }, (_, i) => ({ index: i, home: 2.1, draw: 3.2, away: 3.5 })), sources: [] };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(json(shot(0, 13))).mockResolvedValueOnce(json(odds)));
    render(<ImportModal open onClose={vi.fn()} kind="MID13" onLoad={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Screenshots" }));
    await userEvent.upload(screen.getByLabelText("Coupon screenshots"), png("all.png"));
    await userEvent.click(await screen.findByRole("button", { name: "Find market odds" }));
    expect(await screen.findByText("Found market odds for 13 of 13 fixtures.")).toBeInTheDocument();
    expect(screen.queryByText(/have no odds/)).not.toBeInTheDocument();
  });

  it("combines a short live search with a screenshot, and rows can be removed", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(json({ ...shot(0, 10), sources: [] })).mockResolvedValueOnce(json(shot(9, 14))));
    render(<ImportModal open onClose={vi.fn()} kind="MID13" onLoad={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Search live coupon" }));
    expect(await screen.findByText("10 of 13")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Screenshots" }));
    await userEvent.upload(screen.getByLabelText("Coupon screenshots"), png("rest.png"));
    expect(await screen.findByText("13 of 13")).toBeInTheDocument();
    expect(screen.getByText(/only the first 13 are used/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Remove Home 13 v Away 13" }));
    expect(screen.queryByText(/only the first 13 are used/)).not.toBeInTheDocument();
  });

  it("shows the server's error, e.g. a missing API key", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(json({ error: "GEMINI_API_KEY is not configured on the server." }, 503)));
    render(<ImportModal open onClose={vi.fn()} kind="MJP17" onLoad={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Search live coupon" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("GEMINI_API_KEY is not configured");
  });
});

describe("coupon grid with fixtures that have no odds", () => {
  it("labels them 'no odds' instead of showing placeholder prices", async () => {
    const { CouponGrid } = await import("./CouponGrid");
    const { RULES } = await import("../domain/jackpot");
    const { toFixtures, sanitizeRaw } = await import("../domain/parser");
    const fx = toFixtures(sanitizeRaw([{ home: "Leeds", away: "Stoke", kickoff: kickoffAt(1) }]), "ocr", "g", new Date());
    render(<CouponGrid fixtures={fx} selections={{}} excluded={[]} rules={RULES.MID13} now={Date.now()} onToggle={vi.fn()} onExclude={vi.fn()} onOpenMatch={vi.fn()} />);
    expect(screen.getAllByText("no odds")).toHaveLength(3);
    expect(screen.getByRole("button", { name: "Leg 1 pick X (no odds)" })).toBeInTheDocument();
    expect(screen.queryByText("3.20")).not.toBeInTheDocument();
  });
});
