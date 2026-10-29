import { useMemo, useState } from "react";
import type { Coupon, Outcome, Selections, Slip } from "../../domain/types";
import { RULES } from "../../domain/jackpot";
import { MAX_PORTFOLIO_SLIPS, portfolioSummary, type PortfolioSlip } from "../../domain/portfolio";
import { kes } from "../../lib/api";
import { Modal } from "../ui/Modal";

const OUTS: Outcome[] = ["1", "X", "2"];
const oneIn = (p: number) => (p > 0 ? `1 in ${Math.round(1 / p).toLocaleString()}` : "—");

export function PortfolioModal({
  open,
  onClose,
  coupon,
  currentSelections,
  slips,
}: {
  open: boolean;
  onClose: () => void;
  coupon: Coupon;
  currentSelections: Selections;
  slips: Slip[];
}) {
  const rules = RULES[coupon.kind];
  const candidates: PortfolioSlip[] = useMemo(
    () => [
      { key: "current", name: "Current slip", selections: currentSelections },
      ...slips.filter((s) => s.couponId === coupon.id).map((s) => ({ key: s.id, name: s.name, selections: s.selections })),
    ],
    [slips, coupon.id, currentSelections],
  );
  const [picked, setPicked] = useState<Set<string>>(() => new Set(candidates.slice(0, MAX_PORTFOLIO_SLIPS).map((c) => c.key)));
  const chosen = candidates.filter((c) => picked.has(c.key));
  const summary = useMemo(() => portfolioSummary(chosen, coupon.fixtures, rules), [chosen, coupon.fixtures, rules]);
  const gaps = summary.legs.filter((l) => l.uncovered.length > 0).sort((a, b) => a.coverage - b.coverage);

  const toggle = (key: string) =>
    setPicked((cur) => {
      const next = new Set(cur);
      if (next.has(key)) next.delete(key);
      else if (next.size < MAX_PORTFOLIO_SLIPS) next.add(key);
      return next;
    });

  return (
    <Modal
      open={open}
      onClose={onClose}
      width="max-w-5xl"
      title="Slip portfolio"
      subtitle="Combine slips on this coupon: total cost, the exact chance at least one lands, and which outcomes no slip covers."
    >
      {candidates.length < 2 && (
        <p className="mb-3 text-sm text-ink-2">Save slips on this coupon (Save in the slip panel) to combine them with the current one.</p>
      )}
      <fieldset className="flex flex-wrap gap-x-5 gap-y-2">
        <legend className="meta mb-1">Slips in the portfolio (up to {MAX_PORTFOLIO_SLIPS})</legend>
        {candidates.map((c) => (
          <label key={c.key} className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4 accent-[--color-accent]" checked={picked.has(c.key)} onChange={() => toggle(c.key)} />
            {c.name}
          </label>
        ))}
      </fieldset>

      <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-5">
        {[
          ["Slips", String(summary.slips)],
          ["Lines", `${summary.totalLines.toLocaleString()}`],
          ["Cost", kes(summary.totalCost)],
          ["Any slip lands", oneIn(summary.probability)],
          ["Best single slip", oneIn(summary.bestSingle)],
        ].map(([k, v]) => (
          <div key={k} className="bg-surface px-4 py-3">
            <dt className="meta">{k}</dt>
            <dd className="num mt-0.5 font-semibold">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="meta mt-2">
        <span className="num">{summary.distinctLines.toLocaleString()}</span> distinct lines
        {summary.duplicateLines > 0 && (
          <>
            <span className="sep" />
            <span className="text-warn">
              <span className="num">{summary.duplicateLines.toLocaleString()}</span> duplicate line{summary.duplicateLines === 1 ? "" : "s"} (
              {kes(summary.duplicateLines * rules.stake)} paying for the same outcome twice)
            </span>
          </>
        )}
        <span className="sep" />
        Probabilities use the form-adjusted model.
      </p>

      {gaps.length > 0 && summary.slips > 0 && (
        <p className="mt-3 text-sm text-ink-2">
          <span className="font-medium text-bad">{gaps.length} leg{gaps.length === 1 ? "" : "s"} with uncovered outcomes.</span>{" "}
          The riskiest: {gaps.slice(0, 3).map((l) => `leg ${l.fixture.leg} (${l.uncovered.join("/")})`).join(", ")}. If any of those happen, every slip loses.
        </p>
      )}

      <table className="sports-grid mt-3">
        <thead>
          <tr>
            <th>#</th>
            <th>Fixture</th>
            {OUTS.map((o) => (
              <th key={o} className="text-center">
                {o}
              </th>
            ))}
            <th className="text-right">Covered</th>
          </tr>
        </thead>
        <tbody>
          {summary.legs.map((l) => (
            <tr key={l.fixture.id}>
              <td className="num text-ink-3">{l.fixture.leg}</td>
              <td>
                {l.fixture.home} <span className="text-ink-3">v</span> {l.fixture.away}
              </td>
              {OUTS.map((o) => {
                const n = l.counts[o];
                return (
                  <td key={o} className="text-center">
                    <span
                      className={`num inline-grid h-7 w-12 place-items-center rounded-md text-[12px] ${
                        n === 0 ? "bg-bad-soft text-bad" : n === summary.slips ? "bg-accent text-white" : "bg-accent-soft text-accent"
                      }`}
                      title={n === 0 ? "No slip covers this outcome" : `${n} of ${summary.slips} slips`}
                    >
                      {n === 0 ? "—" : `${n}/${summary.slips}`}
                    </span>
                  </td>
                );
              })}
              <td className={`num text-right ${l.coverage < 0.6 ? "text-warn" : "text-ink-2"}`}>{Math.round(l.coverage * 100)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="meta mt-2">
        Covered = model probability that the leg’s result is in at least one slip. Multiplying these gives a ceiling of{" "}
        <span className="num">{oneIn(summary.ceiling)}</span>. The portfolio only reaches it if every combination is held.
      </p>
    </Modal>
  );
}
