import { useState } from "react";
import type { StrategyId } from "../domain/types";
import type { JackpotRules } from "../domain/jackpot";
import { STRATEGIES } from "../domain/strategies";
import { Segmented } from "./ui/Segmented";
import type { ModalId } from "../hooks/useModals";

export function StrategyBar({
  rules,
  strategy,
  doubles,
  onApply,
  onTool,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
}: {
  rules: JackpotRules;
  strategy: StrategyId | "custom";
  doubles: number;
  onApply: (s: StrategyId, d: number) => void;
  onTool: (id: ModalId) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}) {
  const [s, setS] = useState<StrategyId>(strategy === "custom" ? "balanced" : strategy);
  const [d, setD] = useState(doubles);
  const lines = 2 ** d;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 max-w-full flex-wrap items-center gap-3">
        <Segmented
          label="Strategy"
          value={s}
          onChange={setS}
          options={(Object.keys(STRATEGIES) as StrategyId[]).map((k) => ({ value: k, label: STRATEGIES[k].label }))}
        />
        <label className="flex items-center gap-2 text-sm text-ink-2">
          Doubles
          <input
            type="number"
            className="input num w-16"
            min={0}
            max={rules.maxDoubles}
            value={d}
            onChange={(e) => setD(Math.max(0, Math.min(rules.maxDoubles, Number(e.target.value) || 0)))}
          />
          <span className="meta num">
            {lines} line{lines === 1 ? "" : "s"}
          </span>
        </label>
        <button className="btn btn-primary" onClick={() => onApply(s, d)}>
          Generate
        </button>
        <span className="flex">
          <button className="btn btn-ghost px-2" onClick={onUndo} disabled={!canUndo} title="Undo (Ctrl/⌘+Z)" aria-label="Undo">
            ↶
          </button>
          <button className="btn btn-ghost px-2" onClick={onRedo} disabled={!canRedo} title="Redo (Ctrl/⌘+Shift+Z)" aria-label="Redo">
            ↷
          </button>
        </span>
        <span className="meta hidden lg:inline">{STRATEGIES[s].blurb}</span>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <button className="btn btn-ghost" onClick={() => onTool("budget")}>Budget</button>
        <button className="btn btn-ghost" onClick={() => onTool("hedge")}>Hedge</button>
        <button className="btn btn-ghost" onClick={() => onTool("portfolio")}>Portfolio</button>
        <button className="btn btn-ghost" onClick={() => onTool("simulate")}>Simulate</button>
        <button className="btn btn-ghost" onClick={() => onTool("backtest")}>Backtest</button>
        <button className="btn btn-ghost" onClick={() => onTool("drift")}>Odds drift</button>
        <button className="btn btn-ghost" onClick={() => onTool("results")}>Results</button>
      </div>
    </div>
  );
}
