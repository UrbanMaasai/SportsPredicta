import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { registerServiceWorker, useOnline, useUpdateReady } from "./pwa";
import { api } from "./api";

/** Evaluate public/sw.js as the browser would (a classic script), exposing its exports. */
function loadSw() {
  const code = readFileSync("public/sw.js", "utf8");
  const module = { exports: {} as { routeFor: (u: string, m: string, mode?: string) => string; SHELL: string[] } };
  new Function("module", "self", "caches", code)(module, { location: { origin: "https://app.test" } }, undefined);
  return module.exports;
}

describe("service worker routing", () => {
  const { routeFor, SHELL } = loadSw();

  it("never caches API calls or non-GET requests", () => {
    expect(routeFor("https://app.test/api/fixtures/live", "POST")).toBe("network");
    expect(routeFor("https://app.test/api/health", "GET")).toBe("network");
    expect(routeFor("https://app.test/assets/index-abc.js", "POST")).toBe("network");
  });

  it("serves navigations network-first with an offline shell", () => {
    expect(routeFor("https://app.test/", "GET", "navigate")).toBe("navigate");
    expect(routeFor("https://app.test/anything#slip=abc", "GET", "navigate")).toBe("navigate");
  });

  it("caches hashed assets first and revalidates the shell files", () => {
    expect(routeFor("https://app.test/assets/ImportModal-x1y2.js", "GET", "no-cors")).toBe("cache-first");
    expect(routeFor("https://app.test/favicon.svg", "GET")).toBe("stale-while-revalidate");
    expect(SHELL).toContain("/manifest.webmanifest");
  });

  it("leaves other origins alone except Google Fonts", () => {
    expect(routeFor("https://fonts.gstatic.com/s/jetbrains.woff2", "GET")).toBe("stale-while-revalidate");
    expect(routeFor("https://firestore.googleapis.com/v1/x", "GET")).toBe("network");
  });
});

describe("update handshake", () => {
  function fakeContainer(withController = true) {
    const listeners: Record<string, (() => void)[]> = {};
    const worker = { state: "installing", postMessage: vi.fn(), addEventListener: (_: string, cb: () => void) => (listeners.state ??= []).push(cb) };
    const reg = {
      waiting: null,
      installing: worker,
      addEventListener: (_: string, cb: () => void) => (listeners.updatefound ??= []).push(cb),
    };
    const container = {
      controller: withController ? {} : null,
      register: vi.fn(async () => reg),
      addEventListener: (type: string, cb: () => void) => (listeners[type] ??= []).push(cb),
    };
    const fire = (type: string) => listeners[type]?.forEach((cb) => cb());
    return { container: container as unknown as ServiceWorkerContainer, worker, fire };
  }

  function Probe() {
    const ready = useUpdateReady();
    return ready ? <button onClick={ready}>Reload to update</button> : <span>no update</span>;
  }

  it("offers an update only once a new worker is installed, and activates it on request", async () => {
    const { container, worker, fire } = fakeContainer();
    render(<Probe />);
    await act(async () => {
      await registerServiceWorker(container);
    });
    expect(screen.getByText("no update")).toBeInTheDocument();
    await act(async () => {
      fire("updatefound");
      worker.state = "installed";
      fire("state");
    });
    await userEvent.click(screen.getByRole("button", { name: "Reload to update" }));
    expect(worker.postMessage).toHaveBeenCalledWith("SKIP_WAITING");
  });

  it("does not reload the page when the first worker takes control", async () => {
    const reload = vi.fn();
    vi.stubGlobal("location", { ...window.location, reload });
    const { container, fire } = fakeContainer(false);
    await registerServiceWorker(container);
    fire("controllerchange");
    expect(reload).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe("offline awareness", () => {
  afterEach(() => vi.restoreAllMocks());

  function Status() {
    return <span>{useOnline() ? "online" : "offline"}</span>;
  }

  it("tracks the browser's online state", async () => {
    const spy = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    render(<Status />);
    expect(screen.getByText("online")).toBeInTheDocument();
    spy.mockReturnValue(false);
    await act(async () => {
      window.dispatchEvent(new Event("offline"));
    });
    expect(screen.getByText("offline")).toBeInTheDocument();
  });

  it("explains failed API calls when offline", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(api.live("MJP17")).rejects.toThrow(/You're offline/);
  });
});
