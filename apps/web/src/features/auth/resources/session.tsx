"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  updateProfile,
  type User as FirebaseUser,
} from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { firebaseServices } from "@/shared/firebase/client";

export interface WorkspaceSession {
  uid: string;
  email: string | null;
  displayName: string;
  officeId: string;
  role: "agent" | "broker";
}

interface SessionContextValue {
  session: WorkspaceSession | null;
  status: "loading" | "signedOut" | "ready" | "error";
  error: string | null;
  signIn(email: string, password: string): Promise<void>;
  createAccount(displayName: string, email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : "Beklenmeyen bir oturum hatası oluştu.";
}

async function workspaceFor(user: FirebaseUser, displayName?: string): Promise<WorkspaceSession> {
  let token = await user.getIdTokenResult();
  let officeId = token.claims.officeId;
  let role = token.claims.role;

  if (typeof officeId !== "string" || (role !== "agent" && role !== "broker") || displayName) {
    const { functions } = firebaseServices();
    const bootstrap = httpsCallable<{ displayName?: string }, { officeId: string; role: "agent" | "broker" }>(
      functions,
      "bootstrapWorkspace",
    );
    await bootstrap(displayName ? { displayName } : {});
    token = await user.getIdTokenResult(true);
    officeId = token.claims.officeId;
    role = token.claims.role;
  }

  if (typeof officeId !== "string" || (role !== "agent" && role !== "broker")) {
    throw new Error("Çalışma alanı yetkileri oluşturulamadı.");
  }

  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName?.trim() || user.email?.split("@")[0] || "Spherepath kullanıcısı",
    officeId,
    role,
  };
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<WorkspaceSession | null>(null);
  const [status, setStatus] = useState<SessionContextValue["status"]>("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const { auth } = firebaseServices();
    return onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setSession(null);
        setError(null);
        setStatus("signedOut");
        return;
      }

      setStatus("loading");
      try {
        setSession(await workspaceFor(user));
        setError(null);
        setStatus("ready");
      } catch (nextError) {
        setSession(null);
        setError(messageFrom(nextError));
        setStatus("error");
      }
    });
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { auth } = firebaseServices();
    setStatus("loading");
    await signInWithEmailAndPassword(auth, email.trim(), password);
  }, []);

  const createAccount = useCallback(async (displayName: string, email: string, password: string) => {
    const { auth } = firebaseServices();
    setStatus("loading");
    const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
    await updateProfile(credential.user, { displayName: displayName.trim() });
    setSession(await workspaceFor(credential.user, displayName));
    setStatus("ready");
  }, []);

  const signOut = useCallback(async () => {
    const { auth } = firebaseServices();
    await firebaseSignOut(auth);
  }, []);

  const value = useMemo(
    () => ({ session, status, error, signIn, createAccount, signOut }),
    [session, status, error, signIn, createAccount, signOut],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must be used inside SessionProvider.");
  return value;
}
