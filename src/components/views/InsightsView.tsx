import type { Fixture } from "../../domain/types";
import { impliedProbabilities, overround, predictability } from "../../domain/odds";
import { filterSlumps, momentum } from "../../domain/form";
import { TrendLine } from "../charts/TrendLine";
import { C } from "../charts/useD3";

export function InsightsView({ fixtures }: { fixtures: Fixture[] }) {
  const pred = fixtures.map((f) => ({ x: f.leg, y: predictability(f.odds) * 100 }));
  const draw = fixtures.map((f) => ({ x: f.leg, y: impliedProbabilities(f.odds).X * 100 }));
  const mom = fixtures.map((f) => ({ x: f.leg, y: (momentum(f.homeForm) - momentum(f.awayForm)) * 50 }));
  const avgPred = pred.reduce((s, p) => s + p.y, 0) / (pred.length || 1);
  const avgMargin = fixtures.reduce((s, f) => s + overround(f.odds), 0) / (fixtures.length || 1);
  const leagues = Object.entries(
    fixtures.reduce<Record<string, number>>((acc, f) => ({ ...acc, [f.league]: (acc[f.league] ?? 0) + 1 }), {}),
  ).sort((a, b) => b[1] - a[1]);
  const modelled = fixtures.some((f) => f.formModelled);

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <section className="panel lg:col-span-2">
        <div className="panel-h">Predictability trend by leg</div>
        <div className="p-4">
          <TrendLine
            label="Predictability and draw probability by leg"
            series={[
              { name: "Predictability", color: C.accent, values: pred },
              { name: "Draw %", color: C.draw, values: draw },
            ]}
            xFormat={(v) => `L${v}`}
            yFormat={(v) => `${Math.round(v)}`}
          />
          <p className="meta mt-2">
            <span style={{ color: C.accent }}>■</span> Predictability (0–100)
            <span className="sep" />
            <span style={{ color: C.draw }}>■</span> Margin-free draw probability %
          </p>
        </div>
      </section>
      <section className="panel">
        <div className="panel-h">Coupon profile</div>
        <dl className="divide-y divide-line text-sm">
          {[
            ["Average predictability", avgPred.toFixed(1)],
            ["Average bookmaker margin", `${(avgMargin * 100).toFixed(1)}%`],
            ["Slump-warning matches", String(filterSlumps(fixtures).length)],
            ["Draw-zone legs (2.90–3.20)", String(fixtures.filter((f) => f.odds.draw >= 2.9 && f.odds.draw <= 3.2).length)],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between px-4 py-2.5">
              <dt className="text-ink-2">{k}</dt>
              <dd className="num font-medium">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="border-t border-line px-4 py-3">
          <p className="meta mb-1.5">Leagues</p>
          <ul className="space-y-1 text-sm">
            {leagues.map(([l, n]) => (
              <li key={l} className="flex justify-between">
                <span className="text-ink-2">{l}</span>
                <span className="num">{n}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
      <section className="panel lg:col-span-3">
        <div className="panel-h">Momentum differential (home − away)</div>
        <div className="p-4">
          <TrendLine
            label="Momentum differential by leg"
            series={[{ name: "Momentum", color: C.away, values: mom }]}
            yDomain={[-100, 100]}
            xFormat={(v) => `L${v}`}
            yFormat={(v) => `${Math.round(v)}`}
            height={150}
          />
          <p className="meta mt-2">
            Positive favours the home side's recent form.
            {modelled && (
              <>
                <span className="sep" />
                Form for some teams is modelled from market strength because the source did not supply it.
              </>
            )}
          </p>
        </div>
      </section>
    </div>
  );
}
