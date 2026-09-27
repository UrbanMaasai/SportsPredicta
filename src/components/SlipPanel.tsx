import { useMemo, useState } from "react";
import type { Coupon, Selections } from "../domain/types";
import type { JackpotRules, PrizeTable } from "../domain/jackpot";
import { combinations, countByPicks, targetTier, tierPlans, ticketCost, validateSlip } from "../domain/jackpot";
import { couponHealth } from "../domain/health";
import { formatSms, SMS_SHORTCODE } from "../domain/export";
import { copyText, kes, kesCompact } from "../lib/api";

function oneIn(p: number): string {
  if (p <= 0) return "—";
  const n = 1 / p;
  return n >= 1e6 ? `1 in ${(n / 1e6).toFixed(1)}M` : `1 in ${Math.round(n).toLocaleString()}`;
}

export function SlipPanel({
  coupon,
  selections,
  excluded,
  rules,
  prizes,
  onPrizes,
  onSave,
  strategyLabel,
}: {
  coupon: Coupon;
  selections: Selections;
  excluded: string[];
  rules: JackpotRules;
  prizes: PrizeTable;
  onPrizes: (p: PrizeTable) => void;
  onSave: (name: string) => void;
  strategyLabel: string;
}) {
  const fixtures = coupon.fixtures;
  const lines = combinations(selections, fixtures);
  const cost = ticketCost(lines, rules);
  const counts = countByPicks(selections, fixtures);
  const health = useMemo(() => couponHealth(selections, fixtures, rules, excluded), [selections, fixtures, rules, excluded]);
  const issues = validateSlip(selections, fixtures, rules, excluded);
  const sms = formatSms(selections, fixtures, rules);
  const tier = targetTier(rules, excluded.length);
  const plans = tierPlans(rules, prizes, cost);
  const [copied, setCopied] = useState(false);
  const [editPools, setEditPools] = useState(false);
  const [name, setName] = useState("");

  const copySms = async () => {
    if (await copyText(sms.messages.join("\n"))) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <aside className="space-y-4">
      <section className="panel" aria-label="Slip summary">
        <div className="panel-h">
          <span>Slip</span>
          <span className="meta font-normal">{strategyLabel}</span>
        </div>
        <dl className="grid grid-cols-2 gap-px bg-line">
          {[
            ["Lines", lines.toLocaleString()],
            ["Stake", kes(cost)],
            [rules.subTiers.length ? `Hit ${tier}/${rules.legs}` : "Win chance", oneIn(health.probability)],
            ["Health", `${health.score} · ${health.grade}`],
          ].map(([k, v]) => (
            <div key={k} className="bg-surface px-4 py-3">
              <dt className="meta">{k}</dt>
              <dd className="num mt-0.5 text-lg font-semibold">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="meta border-t border-line px-4 py-2">
          <span className="num">{counts.singles}</span> singles
          <span className="sep" />
          <span className="num">{counts.doubles}</span>/{rules.maxDoubles} doubles
          {counts.triples > 0 && (
            <>
              <span className="sep" />
              <span className="num">{counts.triples}</span> triples
            </>
          )}
          <span className="sep" />
          KES <span className="num">{rules.stake}</span> per line
        </p>
      </section>

      <section className="panel" aria-label="Coupon health">
        <div className="panel-h">
          <span>Coupon health</span>
          <span className={`num ${health.score >= 75 ? "text-good" : health.score >= 50 ? "text-warn" : "text-bad"}`}>{health.score}/100</span>
        </div>
        <ul className="divide-y divide-line">
          {health.checks.map((c) => (
            <li key={c.id} className="flex gap-3 px-4 py-2.5 text-sm">
              <span aria-hidden className={c.status === "pass" ? "text-good" : c.status === "warn" ? "text-warn" : "text-bad"}>
                {c.status === "pass" ? "●" : c.status === "warn" ? "▲" : "■"}
              </span>
              <div>
                <p className="font-medium">{c.label}</p>
                <p className="meta">{c.detail}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {rules.subTiers.length > 0 && (
        <section className="panel" aria-label="Prize tiers">
          <div className="panel-h">
            <span>Tiers</span>
            <button className="text-xs font-medium text-accent hover:underline" onClick={() => setEditPools((v) => !v)}>
              {editPools ? "Done" : "Edit pools"}
            </button>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="meta text-left">
                <th className="px-4 py-2 font-medium">Tier</th>
                <th className="px-2 py-2 font-medium">Excl.</th>
                <th className="px-2 py-2 text-right font-medium">Pool</th>
                <th className="px-4 py-2 text-right font-medium">×Stake</th>
              </tr>
            </thead>
            <tbody>
              {plans.map((p) => (
                <tr key={p.tier} className={`border-t border-line ${p.tier === tier ? "bg-accent-soft" : ""}`}>
                  <td className="num px-4 py-1.5 font-medium">
                    {p.tier}/{rules.legs}
                  </td>
                  <td className="num px-2 py-1.5 text-ink-2">{p.excludedCount}</td>
                  <td className="num px-2 py-1.5 text-right">
                    {editPools ? (
                      <input
                        type="number"
                        className="input num h-7 w-28 text-right"
                        value={prizes.pools[p.tier] ?? 0}
                        onChange={(e) => onPrizes({ pools: { ...prizes.pools, [p.tier]: Math.max(0, Number(e.target.value) || 0) } })}
                        aria-label={`Prize pool for ${p.tier} correct`}
                      />
                    ) : (
                      kesCompact(p.pool)
                    )}
                  </td>
                  <td className="num px-4 py-1.5 text-right text-ink-2">{p.leverage ? (p.leverage >= 1e4 ? `${Math.round(p.leverage / 1e3).toLocaleString()}K×` : `${Math.round(p.leverage).toLocaleString()}×`) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="meta border-t border-line px-4 py-2">
            Tick legs under Exclude to target a sub-jackpot. Pools are editable — set them from the live coupon.
          </p>
        </section>
      )}

      <section className="panel" aria-label="SMS">
        <div className="panel-h">
          <span>SMS to {SMS_SHORTCODE}</span>
          <button className="btn h-7" disabled={!sms.ok} onClick={copySms}>
            {copied ? "Copied" : sms.messages.length > 1 ? `Copy ${sms.messages.length}` : "Copy"}
          </button>
        </div>
        <div className="px-4 py-3">
          {sms.ok ? (
            <>
              <code className="num block break-all text-[13px]">{sms.messages[0]}</code>
              {sms.messages.length > 1 && <p className="meta mt-1">+{sms.messages.length - 1} more lines — SMS takes one pick per leg.</p>}
            </>
          ) : (
            <ul className="space-y-1 text-sm text-bad">
              {(issues.filter((i) => i.level === "error").map((i) => i.message).concat(sms.errors)).slice(0, 4).map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          onSave(name.trim() || `${rules.shortName} · ${new Date().toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short" })}`);
          setName("");
        }}
      >
        <input className="input flex-1" placeholder="Name this slip" value={name} onChange={(e) => setName(e.target.value)} aria-label="Slip name" />
        <button className="btn" type="submit">
          Save
        </button>
      </form>
    </aside>
  );
}
