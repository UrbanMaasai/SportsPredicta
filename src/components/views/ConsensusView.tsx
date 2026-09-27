import type { Fixture, Selections } from "../../domain/types";
import { consensus, CONSENSUS_MODELS } from "../../domain/strategies";

export function ConsensusView({ fixtures, onUse }: { fixtures: Fixture[]; onUse: (sel: Selections) => void }) {
  const rows = consensus(fixtures);
  const models = Object.keys(CONSENSUS_MODELS);
  const tiers = { Unanimous: 0, Strong: 0, Split: 0 };
  rows.forEach((r) => tiers[r.tier]++);
  return (
    <section className="panel">
      <div className="panel-h">
        <span>Multi-model consensus</span>
        <button
          className="btn h-7"
          onClick={() => onUse(Object.fromEntries(rows.map((r) => [r.fixture.id, [r.pick]])))}
        >
          Use consensus picks
        </button>
      </div>
      <p className="meta px-4 pt-3">
        <span className="num">{tiers.Unanimous}</span> unanimous
        <span className="sep" />
        <span className="num">{tiers.Strong}</span> strong
        <span className="sep" />
        <span className="num">{tiers.Split}</span> split
        <span className="sep" />
        Models: {models.join(", ")}
      </p>
      <div className="overflow-x-auto p-2">
        <table className="sports-grid">
          <thead>
            <tr>
              <th>#</th>
              <th>Fixture</th>
              {models.map((m) => (
                <th key={m} className="text-center">
                  {m}
                </th>
              ))}
              <th className="text-center">Pick</th>
              <th>Agreement</th>
              <th className="text-right">Confidence</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.fixture.id}>
                <td className="num text-ink-3">{r.fixture.leg}</td>
                <td className="font-medium">
                  {r.fixture.home} <span className="text-ink-3">v</span> {r.fixture.away}
                </td>
                {models.map((m) => (
                  <td key={m} className={`num text-center ${r.votes[m] === r.pick ? "text-ink" : "text-ink-3"}`}>
                    {r.votes[m]}
                  </td>
                ))}
                <td className="num text-center font-semibold text-accent">{r.pick}</td>
                <td className={r.tier === "Unanimous" ? "text-good" : r.tier === "Strong" ? "text-ink-2" : "text-warn"}>{r.tier}</td>
                <td className="text-right">
                  <div className="inline-flex items-center gap-2">
                    <div className="h-1.5 w-16 overflow-hidden rounded-full bg-sunken">
                      <div className="h-full bg-accent" style={{ width: `${Math.round(r.confidence * 100)}%` }} />
                    </div>
                    <span className="num w-8 text-xs">{Math.round(r.confidence * 100)}</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
