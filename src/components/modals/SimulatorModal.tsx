import { useEffect, useMemo, useState } from "react";
import type { Fixture, Selections } from "../../domain/types";
import type { JackpotRules } from "../../domain/jackpot";
import { simulateMatches, stateAt, ticketSurvival } from "../../domain/simulator";
import { Modal } from "../ui/Modal";

export function SimulatorModal({
  open,
  onClose,
  fixtures,
  selections,
  excluded,
  rules,
}: {
  open: boolean;
  onClose: () => void;
  fixtures: Fixture[];
  selections: Selections;
  excluded: string[];
  rules: JackpotRules;
}) {
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1e9));
  const [minute, setMinute] = useState(0);
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(150);
  const sim = useMemo(() => simulateMatches(fixtures, seed), [fixtures, seed]);
  const states = stateAt(sim, minute);
  const tiers = [rules.legs, ...rules.subTiers];
  const survival = ticketSurvival(states, selections, tiers, excluded);

  useEffect(() => {
    if (!running) return;
    if (minute >= 90) {
      setRunning(false);
      return;
    }
    const t = setTimeout(() => setMinute((m) => Math.min(90, m + 1)), speed);
    return () => clearTimeout(t);
  }, [running, minute, speed]);

  useEffect(() => {
    if (!open) setRunning(false);
  }, [open]);

  const restart = () => {
    setSeed(Math.floor(Math.random() * 1e9));
    setMinute(0);
    setRunning(true);
  };

  return (
    <Modal open={open} onClose={onClose} width="max-w-4xl" title="Live matchday simulator" subtitle="Goals are drawn from Poisson rates implied by each fixture's odds.">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button className="btn btn-primary" onClick={() => (minute >= 90 ? restart() : setRunning((r) => !r))}>
            {running ? "Pause" : minute >= 90 ? "New simulation" : minute === 0 ? "Kick off" : "Resume"}
          </button>
          <button className="btn" onClick={() => (setRunning(false), setMinute(90))}>Skip to FT</button>
          <select className="input" value={speed} onChange={(e) => setSpeed(Number(e.target.value))} aria-label="Speed">
            <option value={300}>Slow</option>
            <option value={150}>Normal</option>
            <option value={40}>Fast</option>
          </select>
        </div>
        <p className="num text-2xl font-semibold" aria-live="polite">
          {minute >= 90 ? "FT" : `${minute}'`}
        </p>
      </div>
      <div className="mt-3 h-1 overflow-hidden rounded-full bg-sunken">
        <div className="h-full bg-accent transition-all" style={{ width: `${(minute / 90) * 100}%` }} />
      </div>

      <div className="mt-4 flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm">
        <p>
          Correct <span className="num font-semibold">{survival.correct}</span>/<span className="num">{survival.total}</span>
        </p>
        <p>
          {survival.tierAlive ? (
            <span className="text-good">
              {survival.tierAlive === rules.legs ? "Jackpot alive" : `Bonus ${survival.tierAlive}/${rules.legs} alive`}
            </span>
          ) : (
            <span className="text-bad">All prize tiers busted</span>
          )}
        </p>
        <p className="meta">Tiers tracked: {tiers.sort((a, b) => b - a).join(" · ")}</p>
      </div>

      <table className="sports-grid mt-3">
        <thead>
          <tr>
            <th>#</th>
            <th>Match</th>
            <th className="text-center">Score</th>
            <th className="text-center">Pick</th>
            <th className="text-right">Status</th>
          </tr>
        </thead>
        <tbody>
          {fixtures.map((f, i) => {
            const s = states[i];
            const picks = selections[f.id] ?? [];
            const ok = picks.includes(s.outcome);
            const isExcl = excluded.includes(f.id);
            return (
              <tr key={f.id} data-excluded={isExcl}>
                <td className="num text-ink-3">{f.leg}</td>
                <td>
                  {f.home} <span className="text-ink-3">v</span> {f.away}
                </td>
                <td className="num text-center font-semibold">
                  {s.home} – {s.away}
                </td>
                <td className="num text-center">{picks.join("/")}</td>
                <td className={`text-right text-sm ${isExcl ? "text-ink-3" : ok ? "text-good" : "text-bad"}`}>
                  {isExcl ? "Excluded" : ok ? (minute >= 90 ? "Won" : "On track") : minute >= 90 ? "Lost" : "Off track"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Modal>
  );
}
