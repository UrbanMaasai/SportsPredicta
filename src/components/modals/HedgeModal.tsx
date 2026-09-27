import { useMemo, useState } from "react";
import type { Fixture, Selections } from "../../domain/types";
import type { JackpotRules } from "../../domain/jackpot";
import { buildPortfolio, portfolioCoverage } from "../../domain/hedging";
import { kes } from "../../lib/api";
import { Modal } from "../ui/Modal";

const oneIn = (p: number) => (p > 0 ? `1 in ${Math.round(1 / p).toLocaleString()}` : "—");

export function HedgeModal({
  open,
  onClose,
  fixtures,
  rules,
  onUse,
}: {
  open: boolean;
  onClose: () => void;
  fixtures: Fixture[];
  rules: JackpotRules;
  onUse: (sel: Selections, name: string) => void;
}) {
  const [doubles, setDoubles] = useState(3);
  const tickets = useMemo(() => buildPortfolio(fixtures, rules, doubles), [fixtures, rules, doubles]);
  const cover = useMemo(() => portfolioCoverage(tickets, fixtures), [tickets, fixtures]);
  const total = tickets.reduce((s, t) => s + t.cost, 0);

  return (
    <Modal open={open} onClose={onClose} width="max-w-5xl" title="Hedging & coverage portfolio" subtitle="Three complementary tickets that cover different ways the coupon can break.">
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm text-ink-2">
          Doubles per ticket
          <input type="number" className="input num w-16" min={0} max={rules.maxDoubles} value={doubles} onChange={(e) => setDoubles(Math.max(0, Math.min(rules.maxDoubles, Number(e.target.value) || 0)))} />
        </label>
        <p className="meta">
          Portfolio cost <span className="num text-ink">{kes(total)}</span>
          <span className="sep" />
          Any ticket lands <span className="num text-ink">{oneIn(cover)}</span>
        </p>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {tickets.map((t) => (
          <article key={t.id} className="rounded-md border border-line">
            <header className="border-b border-line px-3 py-2.5">
              <h3 className="font-semibold">{t.name}</h3>
              <p className="meta">{t.purpose}</p>
            </header>
            <ol className="num grid grid-cols-2 gap-x-4 px-3 py-2 text-[12px]">
              {fixtures.map((f) => (
                <li key={f.id} className="flex justify-between border-b border-line/60 py-0.5">
                  <span className="text-ink-3">{String(f.leg).padStart(2, "0")}</span>
                  <span className={t.selections[f.id].length > 1 ? "font-semibold text-accent" : ""}>{t.selections[f.id].join("")}</span>
                </li>
              ))}
            </ol>
            <footer className="space-y-2 border-t border-line px-3 py-2.5">
              <p className="meta">
                <span className="num">{t.lines}</span> lines
                <span className="sep" />
                <span className="num">{kes(t.cost)}</span>
                <span className="sep" />
                <span className="num">{oneIn(t.probability)}</span>
              </p>
              <button className="btn h-7 w-full" onClick={() => (onUse(t.selections, t.name), onClose())}>
                Use this ticket
              </button>
            </footer>
          </article>
        ))}
      </div>
    </Modal>
  );
}
