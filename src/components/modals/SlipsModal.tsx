import type { Slip } from "../../domain/types";
import { RULES } from "../../domain/jackpot";
import { Modal } from "../ui/Modal";

export function SlipsModal({
  open,
  onClose,
  slips,
  currentCouponId,
  onRestore,
  onDelete,
  syncLabel,
}: {
  open: boolean;
  onClose: () => void;
  slips: Slip[];
  currentCouponId: string;
  onRestore: (s: Slip) => void;
  onDelete: (id: string) => void;
  syncLabel: string;
}) {
  return (
    <Modal open={open} onClose={onClose} title="Saved slips" subtitle={syncLabel}>
      {slips.length === 0 ? (
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
                    <span className="num">{new Date(s.updatedAt).toLocaleString("en-KE", { dateStyle: "short", timeStyle: "short" })}</span>
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
      )}
    </Modal>
  );
}
