import { useSyncExternalStore } from "react";

/**
 * Service worker registration and update handshake. A new deploy installs in the background and waits;
 * the page offers "Reload", and only after the user accepts does the new worker take over and the page
 * reload — never mid-session on its own.
 */
let applyUpdate: (() => void) | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function registerServiceWorker(sw: ServiceWorkerContainer | undefined = typeof navigator !== "undefined" ? navigator.serviceWorker : undefined) {
  if (!sw) return;
  let accepted = false;
  const offer = (worker: ServiceWorker) => {
    applyUpdate = () => {
      accepted = true;
      worker.postMessage("SKIP_WAITING");
    };
    emit();
  };
  sw.addEventListener("controllerchange", () => {
    // First install also changes controller (clients.claim); only reload for an accepted update.
    if (accepted) window.location.reload();
  });
  return sw
    .register("/sw.js")
    .then((reg) => {
      if (reg.waiting && sw.controller) offer(reg.waiting);
      reg.addEventListener("updatefound", () => {
        const w = reg.installing;
        w?.addEventListener("statechange", () => {
          if (w.state === "installed" && sw.controller) offer(w);
        });
      });
      return reg;
    })
    .catch(() => undefined); // no SW (private mode, unsupported): the app still works online
}

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

/** Non-null when a new version is installed and waiting; call it to switch over. */
export function useUpdateReady(): (() => void) | null {
  return useSyncExternalStore(subscribe, () => applyUpdate, () => null);
}

const subscribeOnline = (cb: () => void) => {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
};

export function useOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
}
