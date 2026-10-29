import { useCallback, useEffect, useState } from "react";
import type { Slip, StrategyRun } from "../domain/types";
import {
  firebaseEnabled,
  remoteDeleteSlip,
  remoteListRuns,
  remoteListSlips,
  remoteSaveRun,
  remoteSaveSlip,
  signInWithGoogle,
  signOut,
  watchAuth,
  type AuthUser,
} from "../lib/firebase";
import { deleteLocalSlip, loadLocalSlips, loadRuns, mergeRuns, mergeSlips, saveLocalSlip, saveRun } from "../lib/storage";

export function useAuthAndSlips() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [slips, setSlips] = useState<Slip[]>(() => loadLocalSlips());
  const [runs, setRuns] = useState<StrategyRun[]>(() => loadRuns());
  const [syncError, setSyncError] = useState<string | null>(null);

  useEffect(() => watchAuth(setUser), []);

  useEffect(() => {
    if (!user) return;
    remoteListSlips(user.uid)
      .then((remote) => {
        setSlips((local) => mergeSlips(local, remote));
        setSyncError(null);
      })
      .catch((e: Error) => setSyncError(e.message));
    remoteListRuns(user.uid)
      .then((remote) => setRuns((local) => mergeRuns(local, remote)))
      .catch((e: Error) => setSyncError(e.message));
  }, [user]);

  const save = useCallback(
    async (slip: Slip) => {
      setSlips((cur) => mergeSlips(saveLocalSlip(slip), cur.filter((s) => s.id !== slip.id)));
      if (user) {
        try {
          await remoteSaveSlip(user.uid, slip);
          setSyncError(null);
        } catch (e) {
          setSyncError((e as Error).message);
        }
      }
    },
    [user],
  );

  const remove = useCallback(
    async (id: string) => {
      deleteLocalSlip(id);
      setSlips((cur) => cur.filter((s) => s.id !== id));
      if (user) await remoteDeleteSlip(user.uid, id).catch((e: Error) => setSyncError(e.message));
    },
    [user],
  );

  /** Record a strategy run locally and, when signed in, in Firestore. */
  const recordRun = useCallback(
    async (run: StrategyRun) => {
      setRuns((cur) => mergeRuns([run], mergeRuns(saveRun(run), cur)));
      if (user) await remoteSaveRun(user.uid, run).catch((e: Error) => setSyncError(e.message));
    },
    [user],
  );

  return {
    user,
    slips,
    save,
    runs,
    recordRun,
    remove,
    syncError,
    firebaseEnabled,
    signIn: signInWithGoogle,
    signOut,
  };
}
