import { useEffect, useState } from "react";
import type { JackpotKind, Slip } from "./domain/types";
import { DEFAULT_PRIZES, type PrizeTable } from "./domain/jackpot";
import { countdown } from "./domain/fixtures";
import { STRATEGIES } from "./domain/strategies";
import { useJackpot } from "./hooks/useJackpot";
import { useModals } from "./hooks/useModals";
import { useNow } from "./hooks/useNow";
import { useAuthAndSlips } from "./hooks/useAuth";
import { TopBar } from "./components/TopBar";
import { StrategyBar } from "./components/StrategyBar";
import { CouponGrid } from "./components/CouponGrid";
import { SlipPanel } from "./components/SlipPanel";
import { Meta } from "./components/ui/Meta";
import { CompareView } from "./components/views/CompareView";
import { ConsensusView } from "./components/views/ConsensusView";
import { InsightsView } from "./components/views/InsightsView";
import { ImportModal } from "./components/modals/ImportModal";
import { ExportModal } from "./components/modals/ExportModal";
import { BudgetModal } from "./components/modals/BudgetModal";
import { HedgeModal } from "./components/modals/HedgeModal";
import { SimulatorModal } from "./components/modals/SimulatorModal";
import { BacktestModal } from "./components/modals/BacktestModal";
import { DriftModal } from "./components/modals/DriftModal";
import { MatchModal } from "./components/modals/MatchModal";
import { SlipsModal } from "./components/modals/SlipsModal";

const SOURCE_LABEL = {
  seed: "Sample coupon — Import to load the live SportPesa fixtures",
  live: "Live search",
  ocr: "Screenshot OCR",
  text: "Pasted text",
  import: "Imported",
} as const;

const PRIZE_KEY = "sp.prizes.v1";
function loadPrizes(): Record<JackpotKind, PrizeTable> {
  try {
    const raw = localStorage.getItem(PRIZE_KEY);
    if (raw) return { ...DEFAULT_PRIZES, ...JSON.parse(raw) };
  } catch {
    /* fall through */
  }
  return DEFAULT_PRIZES;
}

export default function App() {
  const { kind, setKind, view, setView, state, rules, actions, restoredNotice } = useJackpot();
  const modals = useModals();
  const now = useNow(1000);
  const auth = useAuthAndSlips();
  const [prizes, setPrizes] = useState(loadPrizes);
  const [notice, setNotice] = useState<string | null>(
    restoredNotice.length ? "A saved coupon had already kicked off, so it was replaced with the upcoming round." : null,
  );

  useEffect(() => {
    try {
      localStorage.setItem(PRIZE_KEY, JSON.stringify(prizes));
    } catch {
      /* ignore */
    }
  }, [prizes]);

  const { coupon, selections, excluded, strategy, doubles } = state;
  const fixtures = coupon.fixtures;
  const strategyLabel = strategy === "custom" ? "Custom" : STRATEGIES[strategy].label;
  const first = fixtures[0];

  const saveSlip = (name: string) => {
    const t = new Date().toISOString();
    const slip: Slip = {
      id: crypto.randomUUID(),
      kind,
      couponId: coupon.id,
      name,
      strategy,
      selections,
      excluded,
      createdAt: t,
      updatedAt: t,
    };
    auth.save(slip);
    setNotice(`Saved “${name}”${auth.user ? " to your account" : " on this device"}.`);
  };

  return (
    <div className="min-h-screen">
      <TopBar
        kind={kind}
        onKind={setKind}
        view={view}
        onView={setView}
        onImport={() => modals.open("import")}
        onExport={() => modals.open("export")}
        onSlips={() => modals.open("slips")}
        user={auth.user}
        authAvailable={auth.firebaseEnabled}
        onSignIn={() => auth.signIn().catch((e: Error) => setNotice(e.message))}
        onSignOut={() => auth.signOut()}
      />

      <main className="mx-auto max-w-[1440px] px-4 py-5 sm:px-6">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h1 className="text-xl font-bold tracking-tight">{rules.name}</h1>
            <Meta className="mt-0.5">
              <span>{coupon.title}</span>
              <span>
                <span className="num">{fixtures.length}</span> fixtures
              </span>
              {first && (
                <span>
                  First kickoff in <time className="num" dateTime={first.kickoff}>{countdown(first.kickoff, now)}</time>
                </span>
              )}
              <span className={fixtures[0]?.source === "seed" ? "text-warn" : undefined}>{SOURCE_LABEL[fixtures[0]?.source ?? "seed"]}</span>
            </Meta>
          </div>
          {fixtures[0]?.source !== "seed" && (
            <button className="btn btn-ghost h-7 text-xs" onClick={actions.resetSample}>
              Reset to sample
            </button>
          )}
        </div>

        {notice && (
          <div className="mb-4 flex items-center justify-between rounded-md border border-line bg-surface px-4 py-2 text-sm" role="status">
            <span>{notice}</span>
            <button className="text-ink-3 hover:text-ink" onClick={() => setNotice(null)} aria-label="Dismiss">
              ✕
            </button>
          </div>
        )}

        {view === "coupon" && (
          <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
            <section className="panel min-w-0">
              <div className="border-b border-line px-4 py-3">
                <StrategyBar
                  key={kind}
                  rules={rules}
                  strategy={strategy}
                  doubles={doubles}
                  onApply={actions.applyStrategy}
                  onTool={(id) => modals.open(id, id === "drift" ? modals.fixtureId ?? first?.id : undefined)}
                />
              </div>
              <CouponGrid
                fixtures={fixtures}
                selections={selections}
                excluded={excluded}
                rules={rules}
                now={now}
                onToggle={actions.toggle}
                onExclude={actions.toggleExclude}
                onOpenMatch={(id) => modals.open("match", id)}
              />
            </section>
            <SlipPanel
              coupon={coupon}
              selections={selections}
              excluded={excluded}
              rules={rules}
              prizes={prizes[kind]}
              onPrizes={(p) => setPrizes((all) => ({ ...all, [kind]: p }))}
              onSave={saveSlip}
              strategyLabel={strategyLabel}
            />
          </div>
        )}
        {view === "compare" && <CompareView fixtures={fixtures} maxDoubles={rules.maxDoubles} onApplyHedges={(s) => (actions.setSelections(s), setView("coupon"))} />}
        {view === "consensus" && <ConsensusView fixtures={fixtures} onUse={(s) => (actions.setSelections(s), setView("coupon"))} />}
        {view === "insights" && <InsightsView fixtures={fixtures} />}

        <p className="meta mt-8 text-center">
          Analytics only. Probabilities are estimates derived from market prices and recent form; jackpot outcomes are uncertain. Bet responsibly · 18+.
        </p>
      </main>

      <ImportModal open={modals.isOpen("import")} onClose={modals.close} kind={kind} onLoad={actions.loadCoupon} />
      <ExportModal open={modals.isOpen("export")} onClose={modals.close} coupon={coupon} selections={selections} excluded={excluded} rules={rules} slipName={strategyLabel} />
      <BudgetModal open={modals.isOpen("budget")} onClose={modals.close} fixtures={fixtures} rules={rules} onApply={(s) => actions.setSelections(s)} />
      <HedgeModal open={modals.isOpen("hedge")} onClose={modals.close} fixtures={fixtures} rules={rules} onUse={(s) => actions.setSelections(s)} />
      <SimulatorModal open={modals.isOpen("simulate")} onClose={modals.close} fixtures={fixtures} selections={selections} excluded={excluded} rules={rules} />
      <BacktestModal open={modals.isOpen("backtest")} onClose={modals.close} kind={kind} />
      {modals.isOpen("drift") && <DriftModal open onClose={modals.close} fixtures={fixtures} initialId={modals.fixtureId} />}
      <MatchModal open={modals.isOpen("match")} onClose={modals.close} fixture={fixtures.find((f) => f.id === modals.fixtureId)} />
      <SlipsModal
        open={modals.isOpen("slips")}
        onClose={modals.close}
        slips={auth.slips}
        currentCouponId={coupon.id}
        onRestore={(s) => actions.restoreSlip(s.selections, s.excluded, s.strategy)}
        onDelete={auth.remove}
        syncLabel={
          auth.user
            ? `Synced to Firestore as ${auth.user.email ?? auth.user.displayName}${auth.syncError ? ` · sync error: ${auth.syncError}` : ""}`
            : auth.firebaseEnabled
              ? "Stored on this device. Sign in with Google to sync across devices."
              : "Stored on this device (cloud sync not configured)."
        }
      />
    </div>
  );
}
