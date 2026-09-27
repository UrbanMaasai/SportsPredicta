import type { Fixture, Outcome } from "../../domain/types";
import { impliedProbabilities, overround, predictability } from "../../domain/odds";
import { currentStreak, formPoints, slumpSide } from "../../domain/form";
import { modelProbabilities } from "../../domain/strategies";
import { tacticalProfile } from "../../domain/analytics";
import { Modal } from "../ui/Modal";
import { H2HChart } from "../charts/H2HChart";
import { RadarChart } from "../charts/RadarChart";
import { FormSparkline } from "../charts/FormSparkline";
import { DriftChart } from "./DriftModal";
import { C } from "../charts/useD3";

export function MatchModal({ open, onClose, fixture }: { open: boolean; onClose: () => void; fixture: Fixture | undefined }) {
  if (!fixture) return null;
  const p = impliedProbabilities(fixture.odds);
  const m = modelProbabilities(fixture);
  const side = slumpSide(fixture);
  const outs: [Outcome, string][] = [["1", fixture.home], ["X", "Draw"], ["2", fixture.away]];
  return (
    <Modal
      open={open}
      onClose={onClose}
      width="max-w-4xl"
      title={`${fixture.home} v ${fixture.away}`}
      subtitle={
        <>
          Leg {fixture.leg}
          <span className="sep" />
          {fixture.league}
          <span className="sep" />
          <span className="num">{new Date(fixture.kickoff).toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short" })}</span>
          <span className="sep" />
          Margin <span className="num">{(overround(fixture.odds) * 100).toFixed(1)}%</span>
          <span className="sep" />
          Predictability <span className="num">{Math.round(predictability(fixture.odds) * 100)}</span>
        </>
      }
    >
      {side && (
        <p className="mb-3 text-sm text-bad">
          Slump warning: {side === "both" ? "both sides are" : `${side === "home" ? fixture.home : fixture.away} is`} on a run of 3+ consecutive defeats.
        </p>
      )}
      <div className="grid gap-5 md:grid-cols-2">
        <section>
          <h3 className="mb-2 text-sm font-semibold">Probabilities</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="meta text-left">
                <th className="py-1 font-medium">Outcome</th>
                <th className="py-1 text-right font-medium">Odds</th>
                <th className="py-1 text-right font-medium">Market</th>
                <th className="py-1 text-right font-medium">Form model</th>
              </tr>
            </thead>
            <tbody>
              {outs.map(([o, label]) => (
                <tr key={o} className="border-t border-line">
                  <td className="py-1.5">
                    <span className="num text-ink-3">{o}</span> {label}
                  </td>
                  <td className="num py-1.5 text-right">{(o === "1" ? fixture.odds.home : o === "X" ? fixture.odds.draw : fixture.odds.away).toFixed(2)}</td>
                  <td className="num py-1.5 text-right">{(p[o] * 100).toFixed(1)}%</td>
                  <td className={`num py-1.5 text-right ${m[o] - p[o] > 0.02 ? "text-good" : m[o] - p[o] < -0.02 ? "text-bad" : ""}`}>{(m[o] * 100).toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3 className="mb-2 mt-5 text-sm font-semibold">Form</h3>
          {([["home", fixture.home, fixture.homeForm], ["away", fixture.away, fixture.awayForm]] as const).map(([k, name, form]) => {
            const s = currentStreak(form);
            return (
              <div key={k} className="flex items-center justify-between border-t border-line py-1.5 text-sm">
                <span>{name}</span>
                <span className="flex items-center gap-3">
                  <span className="num tracking-[0.15em]">{form.join("")}</span>
                  <FormSparkline form={form} width={72} height={20} />
                  <span className="meta num w-20 text-right">
                    {s ? `${s.result}${s.length}` : "—"} · {formPoints(form).toFixed(1)} ppg
                  </span>
                </span>
              </div>
            );
          })}
          {fixture.formModelled && <p className="meta mt-1">Form modelled from market strength — the source did not supply results.</p>}

          <h3 className="mb-2 mt-5 text-sm font-semibold">Head-to-head margins</h3>
          <H2HChart margins={fixture.h2h} home={fixture.home} away={fixture.away} width={380} />
        </section>
        <section>
          <h3 className="mb-2 text-sm font-semibold">Tactical radar</h3>
          <div className="flex justify-center">
            <RadarChart axes={tacticalProfile(fixture)} size={280} />
          </div>
          <p className="meta text-center">
            <span style={{ color: C.home }}>■</span> {fixture.home}
            <span className="sep" />
            <span style={{ color: C.away }}>■</span> {fixture.away}
          </p>
          <h3 className="mb-2 mt-5 text-sm font-semibold">Odds drift</h3>
          <DriftChart fixture={fixture} />
        </section>
      </div>
    </Modal>
  );
}
