import type { Fixture, Outcome, Selections } from "../../domain/types";
import { compareStrategies } from "../../domain/strategies";
import { formatOdds, oddsFor, predictability } from "../../domain/odds";
import { sortOutcomes } from "../../domain/jackpot";

const OUTS: Outcome[] = ["1", "X", "2"];

export function CompareView({
  fixtures,
  maxDoubles,
  onApplyHedges,
}: {
  fixtures: Fixture[];
  maxDoubles: number;
  onApplyHedges: (sel: Selections) => void;
}) {
  const rows = compareStrategies(fixtures);
  const agree = rows.filter((r) => r.agree).length;
  const hedges = rows.filter((r) => r.hedge);

  const applyHedges = () => {
    // When disagreements exceed the double-chance cap, hedge the least predictable legs first.
    const hedged = new Set(
      [...hedges].sort((a, b) => predictability(a.fixture.odds) - predictability(b.fixture.odds)).slice(0, maxDoubles).map((r) => r.fixture.id),
    );
    const sel: Selections = {};
    for (const r of rows) sel[r.fixture.id] = hedged.has(r.fixture.id) ? sortOutcomes(r.hedge!) : [r.conservative];
    onApplyHedges(sel);
  };

  return (
    <section className="panel">
      <div className="panel-h">
        <span>Conservative vs Bold</span>
        <button className="btn h-7" onClick={applyHedges} disabled={hedges.length === 0}>
          Hedge {Math.min(hedges.length, maxDoubles)} disagreement{hedges.length === 1 ? "" : "s"}
        </button>
      </div>
      <p className="meta px-4 pt-3">
        <span className="num">{agree}</span> of <span className="num">{rows.length}</span> legs agree
        <span className="sep" />
        <span className="num">{hedges.length}</span> hedging opportunities
        <span className="sep" />
        Disagreements are candidates for a double chance.
      </p>
      <div className="overflow-x-auto p-2">
        <table className="sports-grid">
          <thead>
            <tr>
              <th>#</th>
              <th>Fixture</th>
              {OUTS.map((o) => (
                <th key={o} className="text-center">
                  {o}
                </th>
              ))}
              <th>Verdict</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.fixture.id}>
                <td className="num text-ink-3">{r.fixture.leg}</td>
                <td className="font-medium">
                  {r.fixture.home} <span className="text-ink-3">v</span> {r.fixture.away}
                </td>
                {OUTS.map((o) => {
                  const c = r.conservative === o;
                  const b = r.bold === o;
                  return (
                    <td key={o} className="text-center">
                      <div
                        className={`num mx-auto grid h-8 w-16 place-items-center rounded-md text-[13px] ${
                          c && b ? "bg-accent text-white" : c ? "bg-accent-soft text-accent" : b ? "bg-warn-soft text-warn" : "text-ink-3"
                        }`}
                        title={c && b ? "Both strategies" : c ? "Conservative" : b ? "Bold" : undefined}
                      >
                        {formatOdds(oddsFor(r.fixture.odds, o))}
                      </div>
                    </td>
                  );
                })}
                <td className="text-sm">
                  {r.agree ? (
                    <span className="text-ink-2">Agree on {r.conservative}</span>
                  ) : (
                    <span className="text-warn">Hedge {r.hedge!.join("")}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="meta border-t border-line px-4 py-2">
        <span className="text-accent">■</span> Conservative
        <span className="sep" />
        <span className="text-warn">■</span> Bold
        <span className="sep" />
        Solid fill: both agree
      </p>
    </section>
  );
}
