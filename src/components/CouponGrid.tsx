import { useMemo, useState } from "react";
import type { Fixture, Outcome, Selections } from "../domain/types";
import type { JackpotRules } from "../domain/jackpot";
import { countdown } from "../domain/fixtures";
import { currentStreak, filterSlumps, slumpSide } from "../domain/form";
import { formatOdds, isDrawZone, oddsFor, predictability } from "../domain/odds";
import { FormSparkline } from "./charts/FormSparkline";

const OUTS: Outcome[] = ["1", "X", "2"];

function FormCell({ form, slump }: { form: Fixture["homeForm"]; slump: boolean }) {
  const s = currentStreak(form);
  return (
    <div className="flex items-center gap-2">
      <span className="num text-[11px] tracking-[0.15em] text-ink-2" aria-label={`Form ${form.join(" ")}`}>
        {form.map((r, i) => (
          <span key={i} className={r === "W" ? "text-good" : r === "L" ? "text-bad" : "text-ink-3"}>
            {r}
          </span>
        ))}
      </span>
      <FormSparkline form={form} />
      {slump && s && <span className="num text-[11px] font-semibold text-bad">L{s.length}</span>}
    </div>
  );
}

export function CouponGrid({
  fixtures,
  selections,
  excluded,
  rules,
  now,
  onToggle,
  onExclude,
  onOpenMatch,
}: {
  fixtures: Fixture[];
  selections: Selections;
  excluded: string[];
  rules: JackpotRules;
  now: number;
  onToggle: (id: string, o: Outcome) => void;
  onExclude: (id: string) => void;
  onOpenMatch: (id: string) => void;
}) {
  const [slumpOnly, setSlumpOnly] = useState(false);
  const slumpCount = useMemo(() => filterSlumps(fixtures).length, [fixtures]);
  const rows = slumpOnly ? filterSlumps(fixtures) : fixtures;
  const tiered = rules.subTiers.length > 0;
  const maxExcl = tiered ? rules.legs - Math.min(...rules.subTiers) : 0;

  return (
    <div className="overflow-x-auto">
      <table className="sports-grid">
        <thead>
          <tr>
            <th className="w-10">#</th>
            <th>Fixture</th>
            <th>Kickoff</th>
            <th>
              <span className="inline-flex w-[168px] justify-between px-[18px]">
                <span>1</span>
                <span>X</span>
                <span>2</span>
              </span>
            </th>
            <th>
              <div className="flex items-center gap-2">
                <span>Form</span>
                <button
                  type="button"
                  aria-pressed={slumpOnly}
                  onClick={() => setSlumpOnly((v) => !v)}
                  className={`h-6 rounded px-1.5 text-[11px] font-semibold normal-case tracking-normal transition-colors ${
                    slumpOnly ? "bg-bad text-white" : "text-bad hover:bg-bad-soft"
                  }`}
                  title="Show only matches where a team has lost 3+ in a row"
                >
                  Filter by Slump <span className="num">({slumpCount})</span>
                </button>
              </div>
            </th>
            <th>Signal</th>
            {tiered && <th className="text-right">Exclude</th>}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={tiered ? 7 : 6} className="py-10 text-center text-ink-3">
                No matches with a team on a 3+ loss slump.
              </td>
            </tr>
          )}
          {rows.map((f) => {
            const picks = selections[f.id] ?? [];
            const side = slumpSide(f);
            const isExcl = excluded.includes(f.id);
            const pred = predictability(f.odds);
            return (
              <tr key={f.id} data-excluded={isExcl} data-slump={side ?? undefined}>
                <td className="num text-ink-3">{f.leg}</td>
                <td className="min-w-[220px]">
                  <button className="text-left" onClick={() => onOpenMatch(f.id)}>
                    <span className="font-semibold hover:underline">{f.home}</span>
                    <span className="mx-1.5 text-ink-3">v</span>
                    <span className="font-semibold hover:underline">{f.away}</span>
                  </button>
                  <p className="meta">
                    {f.league}
                    {side && (
                      <span className="text-bad">
                        <span className="sep" />
                        {side === "both" ? "Both sides" : side === "home" ? f.home : f.away} on losing slump
                      </span>
                    )}
                  </p>
                </td>
                <td className="whitespace-nowrap">
                  <time dateTime={f.kickoff} className="num block text-[13px]">
                    {countdown(f.kickoff, now)}
                  </time>
                  <span className="meta num">
                    {new Date(f.kickoff).toLocaleString("en-KE", { weekday: "short", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </td>
                <td>
                  <div className="flex gap-1.5" role="group" aria-label={`Leg ${f.leg} picks`}>
                    {OUTS.map((o) => (
                      <button
                        key={o}
                        type="button"
                        className="pick"
                        aria-pressed={picks.includes(o)}
                        aria-label={`Leg ${f.leg} pick ${o} at ${formatOdds(oddsFor(f.odds, o))}`}
                        onClick={() => onToggle(f.id, o)}
                      >
                        <small>{o}</small>
                        {formatOdds(oddsFor(f.odds, o))}
                      </button>
                    ))}
                  </div>
                </td>
                <td>
                  <div className="space-y-1">
                    <FormCell form={f.homeForm} slump={side === "home" || side === "both"} />
                    <FormCell form={f.awayForm} slump={side === "away" || side === "both"} />
                  </div>
                </td>
                <td className="whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-14 overflow-hidden rounded-full bg-sunken" aria-hidden>
                      <div className="h-full rounded-full bg-accent" style={{ width: `${Math.round(pred * 100)}%` }} />
                    </div>
                    <span className="num text-xs text-ink-2">{Math.round(pred * 100)}</span>
                  </div>
                  <span className="meta">{isDrawZone(f.odds) ? "Draw zone" : pred < 0.18 ? "Open game" : pred > 0.4 ? "Clear favourite" : "Lean"}</span>
                </td>
                {tiered && (
                  <td className="text-right">
                    <input
                      type="checkbox"
                      className="size-4 accent-[--color-accent]"
                      checked={isExcl}
                      disabled={!isExcl && excluded.length >= maxExcl}
                      onChange={() => onExclude(f.id)}
                      aria-label={`Exclude leg ${f.leg} for sub-jackpot play`}
                    />
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
