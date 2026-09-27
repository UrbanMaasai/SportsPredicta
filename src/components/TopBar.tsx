import type { JackpotKind } from "../domain/types";
import type { View } from "../hooks/useJackpot";
import type { AuthUser } from "../lib/firebase";
import { Segmented } from "./ui/Segmented";

const VIEWS: { value: View; label: string }[] = [
  { value: "coupon", label: "Coupon" },
  { value: "compare", label: "Compare" },
  { value: "consensus", label: "Consensus" },
  { value: "insights", label: "Insights" },
];
const KINDS: { value: JackpotKind; label: string }[] = [
  { value: "MJP17", label: "Mega 17" },
  { value: "MID13", label: "Midweek 13" },
];

const action = "h-8 rounded-md px-2.5 sm:px-3 text-sm font-medium text-slate-300 hover:bg-bar-2 hover:text-white";

export function TopBar({
  kind,
  onKind,
  view,
  onView,
  onImport,
  onExport,
  onSlips,
  user,
  authAvailable,
  onSignIn,
  onSignOut,
}: {
  kind: JackpotKind;
  onKind: (k: JackpotKind) => void;
  view: View;
  onView: (v: View) => void;
  onImport: () => void;
  onExport: () => void;
  onSlips: () => void;
  user: AuthUser | null;
  authAvailable: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
}) {
  return (
    <header className="sticky top-0 z-30 bg-bar text-white">
      <div className="mx-auto flex h-14 max-w-[1440px] items-center justify-between gap-4 px-4 sm:px-6 lg:grid lg:grid-cols-[1fr_auto_1fr]">
        {/* Zone 1: wordmark */}
        <a href="/" className="shrink-0 justify-self-start text-[15px] font-bold tracking-tight">
          SportsPredicta
        </a>

        {/* Zone 2: view controls (second row below lg) */}
        <nav className="hidden items-center gap-2 lg:flex" aria-label="View controls">
          <Segmented dark label="Jackpot" value={kind} onChange={onKind} options={KINDS} />
          <Segmented dark label="View" value={view} onChange={onView} options={VIEWS} />
        </nav>

        {/* Zone 3: actions */}
        <div className="flex items-center justify-self-end gap-1">
          <button className={action} onClick={onImport}>
            Import
          </button>
          <button className={action} onClick={onSlips}>
            Slips
          </button>
          <button className="h-8 rounded-md bg-white px-3 text-sm font-semibold text-bar hover:bg-slate-200" onClick={onExport}>
            Export
          </button>
          {authAvailable &&
            (user ? (
              <button
                className="ml-1 grid size-8 place-items-center rounded-full bg-bar-2 text-xs font-semibold"
                onClick={onSignOut}
                title={`Signed in as ${user.email ?? user.displayName ?? "user"} — click to sign out`}
                aria-label="Sign out"
              >
                {(user.displayName ?? user.email ?? "U").slice(0, 1).toUpperCase()}
              </button>
            ) : (
              <button className={action} onClick={onSignIn}>
                Sign in
              </button>
            ))}
        </div>
      </div>
      <nav className="flex gap-2 overflow-x-auto border-t border-bar-2 px-4 py-1.5 lg:hidden" aria-label="View controls (compact)">
        <Segmented dark label="Jackpot" value={kind} onChange={onKind} options={KINDS} />
        <Segmented dark label="View" value={view} onChange={onView} options={VIEWS} />
      </nav>
    </header>
  );
}
