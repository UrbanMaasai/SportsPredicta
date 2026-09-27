import { useCallback, useEffect, useState } from "react";
import type { Slip } from "../domain/types";
import {
  firebaseEnabled,
  remoteDeleteSlip,
  remoteListSlips,
  remoteSaveSlip,
  signInWithGoogle,
  signOut,
  watchAuth,
  type AuthUser,
} from "../lib/firebase";
import { deleteLocalSlip, loadLocalSlips, mergeSlips, saveLocalSlip } from "../lib/storage";

export function useAuthAndSlips() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [slips, setSlips] = useState<Slip[]>(() => loadLocalSlips());
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

  return {
    user,
    slips,
    save,
    remove,
    syncError,
    firebaseEnabled,
    signIn: signInWithGoogle,
    signOut,
  };
}
