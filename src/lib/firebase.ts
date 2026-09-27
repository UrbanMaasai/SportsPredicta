import type { Slip } from "../domain/types";

/**
 * Firebase Auth (Google sign-in) + Firestore slip storage. The SDK is only downloaded when
 * VITE_FIREBASE_* config is present; otherwise the app runs in LocalStorage-only mode.
 */
const env = import.meta.env;
const config = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};

export const firebaseEnabled = Boolean(config.apiKey && config.projectId && config.appId);

export interface AuthUser {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
}

type Sdk = Awaited<ReturnType<typeof load>>;
let sdk: Promise<Sdk> | null = null;

async function load() {
  const [{ initializeApp }, authMod, fs] = await Promise.all([
    import("firebase/app"),
    import("firebase/auth"),
    import("firebase/firestore"),
  ]);
  const app = initializeApp(config);
  return { auth: authMod.getAuth(app), db: fs.getFirestore(app), authMod, fs };
}

function getSdk(): Promise<Sdk> {
  if (!firebaseEnabled) return Promise.reject(new Error("Firebase is not configured."));
  sdk ??= load();
  return sdk;
}

export function watchAuth(cb: (u: AuthUser | null) => void): () => void {
  if (!firebaseEnabled) {
    cb(null);
    return () => {};
  }
  let unsub = () => {};
  let cancelled = false;
  getSdk()
    .then(({ auth, authMod }) => {
      if (cancelled) return;
      unsub = authMod.onAuthStateChanged(auth, (u) =>
        cb(u ? { uid: u.uid, displayName: u.displayName, email: u.email, photoURL: u.photoURL } : null),
      );
    })
    .catch(() => cb(null));
  return () => {
    cancelled = true;
    unsub();
  };
}

export async function signInWithGoogle(): Promise<void> {
  const { auth, authMod } = await getSdk();
  await authMod.signInWithPopup(auth, new authMod.GoogleAuthProvider());
}

export async function signOut(): Promise<void> {
  if (!firebaseEnabled) return;
  const { auth, authMod } = await getSdk();
  await authMod.signOut(auth);
}

export async function remoteSaveSlip(uid: string, slip: Slip): Promise<void> {
  const { db, fs } = await getSdk();
  await fs.setDoc(fs.doc(db, "users", uid, "slips", slip.id), slip);
}

export async function remoteListSlips(uid: string): Promise<Slip[]> {
  const { db, fs } = await getSdk();
  const snap = await fs.getDocs(fs.query(fs.collection(db, "users", uid, "slips"), fs.orderBy("updatedAt", "desc")));
  return snap.docs.map((d) => d.data() as Slip);
}

export async function remoteDeleteSlip(uid: string, id: string): Promise<void> {
  const { db, fs } = await getSdk();
  await fs.deleteDoc(fs.doc(db, "users", uid, "slips", id));
}
