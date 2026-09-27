import { useMemo, useState } from "react";
import type { Fixture } from "../../domain/types";
import { modelDrift, summarizeDrift } from "../../domain/drift";
import { Modal } from "../ui/Modal";
import { TrendLine } from "../charts/TrendLine";
import { C } from "../charts/useD3";

export function DriftChart({ fixture }: { fixture: Fixture }) {
  const series = useMemo(() => modelDrift(fixture), [fixture]);
  const s = summarizeDrift(series);
  const t0 = new Date(series[0].at).getTime();
  const hours = (at: string) => (new Date(at).getTime() - t0) / 3_600_000;
  const fmt = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
  return (
    <div>
      <TrendLine
        label={`Odds drift for ${fixture.home} v ${fixture.away}`}
        series={[
          { name: "1", color: C.home, values: series.map((p) => ({ x: hours(p.at), y: p.odds.home })) },
          { name: "X", color: C.draw, values: series.map((p) => ({ x: hours(p.at), y: p.odds.draw })) },
          { name: "2", color: C.away, values: series.map((p) => ({ x: hours(p.at), y: p.odds.away })) },
        ]}
        xFormat={(v) => `${Math.round(v)}h`}
        yFormat={(v) => v.toFixed(2)}
        height={200}
      />
      <table className="mt-3 w-full text-sm">
        <thead>
          <tr className="meta text-left">
            <th className="py-1 font-medium">Outcome</th>
            <th className="py-1 text-right font-medium">Opening</th>
            <th className="py-1 text-right font-medium">Now</th>
            <th className="py-1 text-right font-medium">Move</th>
          </tr>
        </thead>
        <tbody>
          {(["home", "draw", "away"] as const).map((k) => (
            <tr key={k} className="border-t border-line">
              <td className="py-1.5">
                <span style={{ color: k === "home" ? C.home : k === "draw" ? C.draw : C.away }}>■</span> {k === "home" ? `1 · ${fixture.home}` : k === "draw" ? "X · Draw" : `2 · ${fixture.away}`}
              </td>
              <td className="num py-1.5 text-right">{s.opening[k].toFixed(2)}</td>
              <td className="num py-1.5 text-right">{s.current[k].toFixed(2)}</td>
              <td className={`num py-1.5 text-right ${s.change[k] < 0 ? "text-good" : s.change[k] > 0 ? "text-bad" : ""}`}>{fmt(s.change[k])}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="meta mt-2">
        {s.steamed ? `Money is coming in on ${s.steamed === "home" ? fixture.home : s.steamed === "away" ? fixture.away : "the draw"}.` : "No significant steam move."}
        <span className="sep" />
        Pre-publication path is modelled; the final point is the current price.
      </p>
    </div>
  );
}

export function DriftModal({ open, onClose, fixtures, initialId }: { open: boolean; onClose: () => void; fixtures: Fixture[]; initialId: string | null }) {
  const [id, setId] = useState(initialId ?? fixtures[0]?.id);
  const fixture = fixtures.find((f) => f.id === (id ?? initialId)) ?? fixtures[0];
  if (!fixture) return null;
  return (
    <Modal open={open} onClose={onClose} title="Odds drift tracker" subtitle="Price movement from coupon publication to kickoff.">
      <select className="input mb-3 w-full" value={fixture.id} onChange={(e) => setId(e.target.value)} aria-label="Fixture">
        {fixtures.map((f) => (
          <option key={f.id} value={f.id}>
            {f.leg}. {f.home} v {f.away}
          </option>
        ))}
      </select>
      <DriftChart fixture={fixture} />
    </Modal>
  );
}
