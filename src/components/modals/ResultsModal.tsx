import { useMemo, useState } from "react";
import type { Coupon, JackpotKind, Outcome, Selections, Slip } from "../../domain/types";
import { RULES } from "../../domain/jackpot";
import { applyFetchedResults, gradeSlip, isSettled, parseResults, type Results } from "../../domain/results";
import { api, kes } from "../../lib/api";
import { loadRounds, saveRoundResults, type StoredRound } from "../../lib/storage";
import { Modal } from "../ui/Modal";

const OUTS: Outcome[] = ["1", "X", "2"];

interface GradedRow {
  key: string;
  name: string;
  selections: Selections;
}

export function ResultsModal({
  open,
  onClose,
  kind,
  current,
  currentSelections,
  slips,
  now = Date.now(),
}: {
  open: boolean;
  onClose: () => void;
  kind: JackpotKind;
  current: Coupon;
  currentSelections: Selections;
  slips: Slip[];
  /** Clock for deciding which fixtures have kicked off (injectable for tests). */
  now?: number;
}) {
  const rules = RULES[kind];
  const [rounds, setRounds] = useState<Record<string, StoredRound>>(() => loadRounds());
  const options = useMemo(
    () =>
      Object.values(rounds)
        .filter((r) => r.coupon.kind === kind)
        .sort((a, b) => (b.coupon.fixtures[0]?.kickoff ?? "").localeCompare(a.coupon.fixtures[0]?.kickoff ?? "")),
    [rounds, kind],
  );
  const [couponId, setCouponId] = useState<string | null>(() => (rounds[current.id] ? current.id : options[0]?.coupon.id ?? null));
  const round = couponId ? rounds[couponId] : undefined;
  const [paste, setPaste] = useState("");
  const [unmatched, setUnmatched] = useState<string[]>([]);
  const [notStarted, setNotStarted] = useState(0);
  const started = (kickoff: string) => new Date(kickoff).getTime() <= now;
  const [fetching, setFetching] = useState(false);
  const [fetchNote, setFetchNote] = useState<{ text: string; tone: "ok" | "warn" | "bad"; sources?: { title: string; uri: string }[] } | null>(null);

  /** Look up full-time scores and published payouts; fills only legs you haven't entered yourself. */
  const fetchResults = async () => {
    if (!round) return;
    setFetching(true);
    setFetchNote(null);
    try {
      const fx = round.coupon.fixtures;
      const raw = await api.results(kind, fx.map((f) => ({ home: f.home, away: f.away, kickoff: f.kickoff })));
      const tiers = [rules.legs, ...rules.subTiers];
      const got = applyFetchedResults(raw, fx, tiers, now);
      const fresh = Object.fromEntries(Object.entries(got.results).filter(([id]) => !round.results[id]));
      const freshPayouts = Object.fromEntries(Object.entries(got.payouts).filter(([t]) => !round.payouts[Number(t)]));
      update({ ...round.results, ...fresh }, { ...round.payouts, ...freshPayouts });
      const n = Object.keys(fresh).length;
      const p = Object.keys(freshPayouts).length;
      setFetchNote({
        text:
          n + p === 0
            ? "No new full-time results or payouts found yet."
            : `Filled ${n} result${n === 1 ? "" : "s"}${p ? ` and ${p} payout${p === 1 ? "" : "s"}` : ""}. Check them against the official SportPesa results before relying on them.`,
        tone: n + p === 0 ? "warn" : "ok",
        sources: raw.sources,
      });
    } catch (e) {
      setFetchNote({ text: (e as Error).message, tone: "bad" });
    } finally {
      setFetching(false);
    }
  };

  const update = (results: Results, payouts = round?.payouts ?? {}) => {
    if (!round) return;
    setRounds(saveRoundResults(round.coupon.id, results, payouts));
  };

  const rows: GradedRow[] = useMemo(() => {
    if (!round) return [];
    const list: GradedRow[] = slips
      .filter((s) => s.couponId === round.coupon.id)
      .map((s) => ({ key: s.id, name: s.name, selections: s.selections }));
    if (round.coupon.id === current.id) list.unshift({ key: "current", name: "Current slip", selections: currentSelections });
    return list;
  }, [round, slips, current.id, currentSelections]);

  const tiers = [rules.legs, ...rules.subTiers].sort((a, b) => b - a);

  return (
    <Modal
      open={open}
      onClose={onClose}
      width="max-w-5xl"
      title="Results & settlement"
      subtitle="Enter the official full-time results to grade your slips. Settled rounds feed the backtester."
    >
      {options.length === 0 || !round ? (
        <p className="text-sm text-ink-2">
          No real {rules.name} coupons yet. Load one with <span className="font-medium">Import</span> (or open a shared slip link) and it will be kept here so you can settle it after the matches.
        </p>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <select className="input min-w-64" value={round.coupon.id} onChange={(e) => setCouponId(e.target.value)} aria-label="Coupon">
              {options.map((r) => (
                <option key={r.coupon.id} value={r.coupon.id}>
                  {r.coupon.title}
                  {r.coupon.id === current.id ? " (current)" : ""}
                  {isSettled(r.coupon, r.results) ? " · settled" : ""}
                </option>
              ))}
            </select>
            <p className="meta">
              <span className="num">{Object.keys(round.results).length}</span>/<span className="num">{round.coupon.fixtures.length}</span> results entered
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
            <table className="sports-grid">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Fixture</th>
                  <th className="text-right">Result</th>
                </tr>
              </thead>
              <tbody>
                {round.coupon.fixtures.map((f) => (
                  <tr key={f.id} title={started(f.kickoff) ? undefined : "Not kicked off yet"}>
                    <td className="num text-ink-3">{f.leg}</td>
                    <td>
                      {f.home} <span className="text-ink-3">v</span> {f.away}
                      {!started(f.kickoff) && <span className="meta ml-2">not started</span>}
                    </td>
                    <td className="text-right">
                      <div className="seg" role="group" aria-label={`Result for leg ${f.leg}`}>
                        {OUTS.map((o) => (
                          <button
                            key={o}
                            type="button"
                            aria-pressed={round.results[f.id] === o}
                            disabled={!started(f.kickoff)}
                            onClick={() => {
                              const next = { ...round.results };
                              if (next[f.id] === o) delete next[f.id];
                              else next[f.id] = o;
                              update(next);
                            }}
                          >
                            <span className="num">{o}</span>
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="space-y-4">
              <div>
                <button
                  className="btn btn-primary w-full"
                  disabled={fetching || !round.coupon.fixtures.some((f) => started(f.kickoff) && !round.results[f.id])}
                  onClick={fetchResults}
                  title="Search for full-time scores and published payouts (needs the server's Gemini key)"
                >
                  {fetching ? "Searching…" : "Fetch results"}
                </button>
                {fetchNote && (
                  <p className={`mt-2 text-sm ${fetchNote.tone === "ok" ? "text-good" : fetchNote.tone === "warn" ? "text-warn" : "text-bad"}`} role="status">
                    {fetchNote.text}
                    {fetchNote.sources && fetchNote.sources.length > 0 && (
                      <span className="meta block">
                        Sources:{" "}
                        {fetchNote.sources.slice(0, 3).map((x, i) => (
                          <span key={x.uri} className={i ? "sep" : undefined}>
                            <a className="underline" href={x.uri} target="_blank" rel="noreferrer">
                              {x.title || new URL(x.uri).hostname}
                            </a>
                          </span>
                        ))}
                      </span>
                    )}
                  </p>
                )}
              </div>
              <div>
                <label className="meta mb-1 block" htmlFor="results-paste">
                  Paste results
                </label>
                <textarea
                  id="results-paste"
                  className="input num h-28 w-full py-2 text-[13px]"
                  placeholder={"1X21X21X21X21X21X\n— or —\nArsenal 2-1 Chelsea\nInter 0-0 Roma"}
                  value={paste}
                  onChange={(e) => setPaste(e.target.value)}
                />
                <button
                  className="btn mt-2"
                  disabled={!paste.trim()}
                  onClick={() => {
                    const parsed = parseResults(paste, round.coupon.fixtures);
                    // Results only count for fixtures that have actually kicked off.
                    const playable = Object.fromEntries(
                      Object.entries(parsed.results).filter(([id]) => started(round.coupon.fixtures.find((f) => f.id === id)!.kickoff)),
                    );
                    update({ ...round.results, ...playable });
                    setUnmatched(parsed.unmatched);
                    setNotStarted(Object.keys(parsed.results).length - Object.keys(playable).length);
                  }}
                >
                  Apply
                </button>
                {notStarted > 0 && (
                  <p className="mt-2 text-sm text-warn">
                    Skipped {notStarted} result{notStarted === 1 ? "" : "s"} for fixtures that haven’t kicked off yet.
                  </p>
                )}
                {unmatched.length > 0 && (
                  <p className="mt-2 text-sm text-warn">
                    Couldn’t match: {unmatched.slice(0, 3).join(" · ")}
                    {unmatched.length > 3 ? ` +${unmatched.length - 3} more` : ""}
                  </p>
                )}
              </div>

              <div>
                <p className="meta mb-1">Prize per winning line (for backtest ROI)</p>
                <div className="space-y-1.5">
                  {tiers.map((t) => (
                    <label key={t} className="flex items-center justify-between gap-2 text-sm">
                      <span className="num">
                        {t}/{rules.legs}
                      </span>
                      <input
                        type="number"
                        min={0}
                        className="input num h-7 w-36 text-right"
                        value={round.payouts[t] ?? ""}
                        placeholder="KES"
                        onChange={(e) => update(round.results, { ...round.payouts, [t]: Math.max(0, Number(e.target.value) || 0) })}
                        aria-label={`Prize per line for ${t} correct`}
                      />
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <section>
            <h3 className="mb-2 text-sm font-semibold">Slips on this coupon</h3>
            {rows.length === 0 ? (
              <p className="text-sm text-ink-3">No saved slips for this coupon.</p>
            ) : (
              <table className="sports-grid">
                <thead>
                  <tr>
                    <th>Slip</th>
                    <th className="text-right">Correct</th>
                    <th className="text-right">Best tier</th>
                    {tiers.map((t) => (
                      <th key={t} className="text-right">
                        Lines ≥{t}
                      </th>
                    ))}
                    <th className="text-right">Won</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const g = gradeSlip(r.selections, round.coupon.fixtures, round.results, rules);
                    // Prize: each line pays the tier it reaches exactly (highest tier only).
                    let won = 0;
                    tiers.forEach((t, i) => {
                      const above = i === 0 ? 0 : g.linesAtTier[tiers[i - 1]];
                      won += (g.linesAtTier[t] - above) * (round.payouts[t] ?? 0);
                    });
                    const settled = g.decided === g.total;
                    return (
                      <tr key={r.key}>
                        <td className="font-medium">{r.name}</td>
                        <td className="num text-right">
                          {g.correct}/{g.decided}
                        </td>
                        <td className={`num text-right ${g.tierHit ? "text-good" : "text-ink-3"}`}>
                          {g.tierHit ? `${g.tierHit}/${rules.legs}` : settled ? "None" : g.missed.length > rules.legs - Math.min(...tiers) ? "Busted" : "Alive"}
                        </td>
                        {tiers.map((t) => (
                          <td key={t} className="num text-right">
                            {settled ? g.linesAtTier[t] : "—"}
                          </td>
                        ))}
                        <td className="num text-right">{settled && won > 0 ? kes(won) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            <p className="meta mt-2">
              Correct counts the best line. Lines ≥ tier counts every combination line reaching that tier once all results are in.
              {isSettled(round.coupon, round.results) && (
                <>
                  <span className="sep" />
                  Settled — this round now appears under “My rounds” in Backtest.
                </>
              )}
            </p>
          </section>
        </div>
      )}
    </Modal>
  );
}
