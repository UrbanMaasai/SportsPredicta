import { useMemo, useState } from "react";
import type { Fixture, Selections, StrategyId } from "../../domain/types";
import type { JackpotRules } from "../../domain/jackpot";
import { optimizeBudget } from "../../domain/optimizer";
import { buildStrategy, STRATEGIES } from "../../domain/strategies";
import { kes } from "../../lib/api";
import { Modal } from "../ui/Modal";
import { Segmented } from "../ui/Segmented";

export function BudgetModal({
  open,
  onClose,
  fixtures,
  rules,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  fixtures: Fixture[];
  rules: JackpotRules;
  onApply: (sel: Selections) => void;
}) {
  const [budget, setBudget] = useState(rules.stake * 16);
  const [base, setBase] = useState<StrategyId>("balanced");
  const result = useMemo(
    () => optimizeBudget(fixtures, buildStrategy(base, fixtures, 0), rules, budget),
    [fixtures, rules, budget, base],
  );
  const byId = Object.fromEntries(fixtures.map((f) => [f.id, f]));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Smart budget optimiser"
      subtitle="Chooses which legs to double (or triple) to maximise the chance the slip lands without exceeding your budget."
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={!result} onClick={() => result && (onApply(result.selections), onClose())}>
            Apply to slip
          </button>
        </>
      }
    >
      <div className="flex flex-wrap items-end gap-4">
        <label className="text-sm">
          <span className="meta block">Budget (KES)</span>
          <input
            type="number"
            className="input num mt-1 w-36"
            min={rules.stake}
            step={rules.stake}
            value={budget}
            onChange={(e) => setBudget(Math.max(0, Number(e.target.value) || 0))}
          />
        </label>
        <div>
          <span className="meta mb-1 block">Base picks</span>
          <Segmented
            label="Base strategy"
            value={base}
            onChange={setBase}
            options={(Object.keys(STRATEGIES) as StrategyId[]).map((k) => ({ value: k, label: STRATEGIES[k].label }))}
          />
        </div>
      </div>

      {!result ? (
        <p className="mt-4 text-sm text-bad">Budget must cover at least one line ({kes(rules.stake)}).</p>
      ) : (
        <>
          <dl className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-4">
            {[
              ["Lines", result.lines.toLocaleString()],
              ["Cost", kes(result.cost)],
              ["Unspent", kes(result.leftover)],
              ["Probability lift", `${result.lift.toFixed(2)}×`],
            ].map(([k, v]) => (
              <div key={k} className="bg-surface px-4 py-3">
                <dt className="meta">{k}</dt>
                <dd className="num mt-0.5 font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="meta mt-3">
            Capped at <span className="num">{rules.maxDoubles}</span> doubles and <span className="num">{rules.maxLines}</span> lines
            <span className="sep" />
            Leverage comes from covering the least predictable legs first.
          </p>
          <ul className="mt-3 divide-y divide-line rounded-md border border-line text-sm">
            {[...result.triples.map((id) => ["Triple", id]), ...result.doubles.map((id) => ["Double", id])].map(([t, id]) => (
              <li key={id} className="flex justify-between px-3 py-2">
                <span>
                  <span className="num text-ink-3">{byId[id].leg}</span> {byId[id].home} <span className="text-ink-3">v</span> {byId[id].away}
                </span>
                <span className="num text-ink-2">
                  {t} · {result.selections[id].join("")}
                </span>
              </li>
            ))}
            {result.doubles.length + result.triples.length === 0 && <li className="px-3 py-2 text-ink-3">Budget only covers a single line.</li>}
          </ul>
        </>
      )}
    </Modal>
  );
}
