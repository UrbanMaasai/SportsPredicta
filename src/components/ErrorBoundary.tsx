import { Component, type ErrorInfo, type ReactNode } from "react";

const SESSION_KEY = "sp.session.v1";

interface State {
  error: Error | null;
}

/**
 * Last line of defence: a rendering error shows a recovery screen instead of a blank page.
 * "Reset session" clears only the saved working session (coupon and picks) — saved slips,
 * results and history are kept.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[app] render error", error, info.componentStack);
  }

  private resetSession = () => {
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch {
      /* storage unavailable */
    }
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="mx-auto max-w-lg px-6 py-24" role="alert">
        <h1 className="text-xl font-bold">Something went wrong</h1>
        <p className="mt-2 text-sm text-ink-2">
          The page hit an unexpected error. Reloading usually fixes it. If it keeps happening, reset the working session — your
          saved slips, results and strategy history are kept.
        </p>
        <pre className="num mt-4 overflow-auto rounded-md bg-sunken p-3 text-xs text-ink-2">{this.state.error.message}</pre>
        <div className="mt-4 flex gap-2">
          <button className="btn btn-primary" onClick={() => window.location.reload()}>
            Reload
          </button>
          <button className="btn" onClick={this.resetSession}>
            Reset session
          </button>
        </div>
      </main>
    );
  }
}
