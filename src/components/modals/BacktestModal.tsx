import { useMemo, useState } from "react";
import type { JackpotKind, StrategyId } from "../../domain/types";
import { RULES } from "../../domain/jackpot";
import { parseArchive, runBacktest, simulatedArchive, type HistoricalRound } from "../../domain/backtest";
import { STRATEGIES } from "../../domain/strategies";
import { kes, pct } from "../../lib/api";
import { Modal } from "../ui/Modal";
import { TrendLine } from "../charts/TrendLine";
import { C } from "../charts/useD3";

export function BacktestModal({ open, onClose, kind }: { open: boolean; onClose: () => void; kind: JackpotKind }) {
  const rules = RULES[kind];
  const [imported, setImported] = useState<HistoricalRound[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [doubles, setDoubles] = useState(0);
  const archive = useMemo(() => (imported ?? simulatedArchive(kind)).filter((r) => r.kind === kind), [imported, kind]);
  const results = useMemo(
    () => (Object.keys(STRATEGIES) as StrategyId[]).map((s) => runBacktest(archive, s, doubles)),
    [archive, doubles],
  );
  const verified = archive.length > 0 && archive.every((r) => r.provenance === "verified");

  return (
    <Modal
      open={open}
      onClose={onClose}
      width="max-w-4xl"
      title="Historical backtest"
      subtitle={
        verified
          ? `${archive.length} imported rounds with verified results and payouts.`
          : "Using a simulated archive drawn from the market model. Import verified SportPesa results for a real backtest."
      }
    >
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm text-ink-2">
          Doubles
          <input type="number" className="input num w-16" min={0} max={rules.maxDoubles} value={doubles} onChange={(e) => setDoubles(Math.max(0, Math.min(rules.maxDoubles, Number(e.target.value) || 0)))} />
        </label>
        <label className="btn cursor-pointer">
          Import verified results (JSON)
          <input
            type="file"
            accept="application/json"
            className="sr-only"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              try {
                setImported(parseArchive(JSON.parse(await file.text())));
                setError(null);
              } catch (err) {
                setError((err as Error).message);
              }
            }}
          />
        </label>
        {imported && (
          <button className="btn btn-ghost" onClick={() => setImported(null)}>
            Use simulated archive
          </button>
        )}
      </div>
      {error && <p className="mt-2 text-sm text-bad">{error}</p>}
      {archive.length === 0 ? (
        <p className="mt-4 text-sm text-ink-3">No {rules.name} rounds in the archive.</p>
      ) : (
        <>
          <table className="sports-grid mt-4">
            <thead>
              <tr>
                <th>Strategy</th>
                <th className="text-right">Hit rate</th>
                <th className="text-right">Avg correct</th>
                <th className="text-right">Best</th>
                <th className="text-right">Tier hits</th>
                <th className="text-right">Staked</th>
                <th className="text-right">Returned</th>
                <th className="text-right">ROI</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.strategy}>
                  <td className="font-medium">{STRATEGIES[r.strategy].label}</td>
                  <td className="num text-right">{pct(r.hitRate)}</td>
                  <td className="num text-right">{r.avgCorrect.toFixed(1)}</td>
                  <td className="num text-right">
                    {r.bestCorrect}/{rules.legs}
                  </td>
                  <td className="num text-right">{Object.values(r.tierHits).reduce((a, b) => a + b, 0)}</td>
                  <td className="num text-right">{kes(r.totalCost)}</td>
                  <td className="num text-right">{kes(r.totalPayout)}</td>
                  <td className={`num text-right ${r.roi >= 0 ? "text-good" : "text-bad"}`}>{pct(r.roi, 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-4">
            <p className="meta mb-1">Correct picks per round</p>
            <TrendLine
              label="Correct picks per round by strategy"
              series={results.map((r, i) => ({
                name: STRATEGIES[r.strategy].label,
                color: [C.accent, C.ink2, C.warn][i],
                values: [...r.rounds].reverse().map((x, j) => ({ x: j + 1, y: x.correct })),
              }))}
              yDomain={[0, rules.legs]}
              xFormat={(v) => `R${v}`}
              height={160}
            />
            <p className="meta mt-1">
              {results.map((r, i) => (
                <span key={r.strategy} className={i ? "sep" : undefined}>
                  <span style={{ color: [C.accent, C.ink2, C.warn][i] }}>■</span> {STRATEGIES[r.strategy].label}
                </span>
              ))}
            </p>
          </div>
        </>
      )}
    </Modal>
  );
}
