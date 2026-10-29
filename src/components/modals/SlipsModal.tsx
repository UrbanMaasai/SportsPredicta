import { useState } from "react";
import type { Slip, StrategyRun } from "../../domain/types";
import { RULES } from "../../domain/jackpot";
import { STRATEGIES } from "../../domain/strategies";
import { kes } from "../../lib/api";
import { Modal } from "../ui/Modal";
import { Segmented } from "../ui/Segmented";

const when = (iso: string) => new Date(iso).toLocaleString("en-KE", { dateStyle: "short", timeStyle: "short" });
const oneIn = (p: number) => (p > 0 ? `1 in ${Math.round(1 / p).toLocaleString()}` : "—");

export function SlipsModal({
  open,
  onClose,
  slips,
  currentCouponId,
  onRestore,
  onDelete,
  syncLabel,
  runs = [],
  onReapply,
}: {
  open: boolean;
  onClose: () => void;
  slips: Slip[];
  currentCouponId: string;
  onRestore: (s: Slip) => void;
  onDelete: (id: string) => void;
  syncLabel: string;
  /** Strategy runs for the active jackpot, newest first. */
  runs?: StrategyRun[];
  onReapply?: (r: StrategyRun) => void;
}) {
  const [tab, setTab] = useState<"slips" | "history">("slips");
  return (
    <Modal open={open} onClose={onClose} title={tab === "slips" ? "Saved slips" : "Strategy history"} subtitle={syncLabel}>
      <div className="mb-3">
        <Segmented
          label="Slips or history"
          value={tab}
          onChange={setTab}
          options={[
            { value: "slips", label: `Saved slips (${slips.length})` },
            { value: "history", label: `Strategy history (${runs.length})` },
          ]}
        />
      </div>

      {tab === "slips" &&
        (slips.length === 0 ? (
          <p className="text-sm text-ink-3">No saved slips yet. Use Save in the slip panel.</p>
        ) : (
          <ul className="divide-y divide-line rounded-md border border-line">
            {slips.map((s) => {
              const lines = Object.values(s.selections).reduce((a, p) => a * p.length, 1);
              const sameCoupon = s.couponId === currentCouponId;
              return (
                <li key={s.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{s.name}</p>
                    <p className="meta">
                      {RULES[s.kind].shortName}
                      <span className="sep" />
                      {s.strategy}
                      <span className="sep" />
                      <span className="num">{lines}</span> lines
                      <span className="sep" />
                      <span className="num">{when(s.updatedAt)}</span>
                      {!sameCoupon && (
                        <>
                          <span className="sep" />
                          Different coupon
                        </>
                      )}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button className="btn h-7" disabled={!sameCoupon} onClick={() => (onRestore(s), onClose())} title={sameCoupon ? undefined : "This slip belongs to another coupon"}>
                      Restore
                    </button>
                    <button className="btn btn-ghost h-7 text-bad" onClick={() => onDelete(s.id)} aria-label={`Delete ${s.name}`}>
                      Delete
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        ))}

      {tab === "history" &&
        (runs.length === 0 ? (
          <p className="text-sm text-ink-3">No strategy runs yet. Each Generate is recorded here.</p>
        ) : (
          <table className="sports-grid">
            <thead>
              <tr>
                <th>When</th>
                <th>Strategy</th>
                <th className="text-right">Doubles</th>
                <th className="text-right">Lines</th>
                <th className="text-right">Stake</th>
                <th className="text-right">Win chance</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => {
                const same = r.couponId === currentCouponId;
                return (
                  <tr key={r.id}>
                    <td>
                      <span className="num">{when(r.at)}</span>
                      {!same && <span className="meta block">{r.couponTitle}</span>}
                    </td>
                    <td>{STRATEGIES[r.strategy]?.label ?? r.strategy}</td>
                    <td className="num text-right">{r.doubles}</td>
                    <td className="num text-right">{r.lines}</td>
                    <td className="num text-right">{kes(r.cost)}</td>
                    <td className="num text-right">{oneIn(r.probability)}</td>
                    <td className="text-right">
                      <button
                        className="btn h-7"
                        disabled={!same || !onReapply}
                        title={same ? "Generate this strategy again on the current coupon" : "Ran on a different coupon"}
                        onClick={() => (onReapply?.(r), onClose())}
                      >
                        Re-apply
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ))}
    </Modal>
  );
}
