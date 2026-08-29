"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  createUserWithEmailAndPassword,
  deleteUser,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  updateProfile,
  type User as FirebaseUser,
} from "firebase/auth";
import { authErrorMessage, createCommandId } from "@spherepath/shared";
import { apiClient } from "@/shared/api/client";
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
  createAccount(displayName: string, email: string, password: string, inviteCode?: string): Promise<void>;
  resetPassword(email: string): Promise<void>;
  refreshSession(): Promise<void>;
  signOut(): Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

async function workspaceFor(user: FirebaseUser, displayName?: string, inviteCode?: string): Promise<WorkspaceSession> {
  let token = await user.getIdTokenResult();
  let officeId = token.claims.officeId;
  let role = token.claims.role;

  if (typeof officeId !== "string" || (role !== "agent" && role !== "broker") || displayName) {
    await apiClient.command<{ displayName?: string; inviteCode?: string }, { officeId: string; role: "agent" | "broker" }>(
      "bootstrapWorkspace",
      displayName ? { displayName, ...(inviteCode ? { inviteCode } : {}) } : {},
      createCommandId(user.uid),
    );
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
  const registrationInProgress = useRef(false);
  const [session, setSession] = useState<WorkspaceSession | null>(null);
  const [status, setStatus] = useState<SessionContextValue["status"]>("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const { auth } = firebaseServices();
    let active = true;
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (registrationInProgress.current) return;
      if (!user) {
        if (!active) return;
        setSession(null);
        setError(null);
        setStatus("signedOut");
        return;
      }

      setStatus("loading");
      try {
        const nextSession = await workspaceFor(user);
        if (!active) return;
        setSession(nextSession);
        setError(null);
        setStatus("ready");
      } catch (nextError) {
        if (!active) return;
        setSession(null);
        setError(authErrorMessage(nextError));
        setStatus("error");
      }
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { auth } = firebaseServices();
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (nextError) {
      setStatus("signedOut");
      throw new Error(authErrorMessage(nextError));
    }
  }, []);

  const createAccount = useCallback(async (displayName: string, email: string, password: string, inviteCode?: string) => {
    const { auth } = firebaseServices();
    registrationInProgress.current = true;
    let credential: Awaited<ReturnType<typeof createUserWithEmailAndPassword>> | null = null;
    try {
      credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
      await updateProfile(credential.user, { displayName: displayName.trim() });
      setSession(await workspaceFor(credential.user, displayName, inviteCode));
      setError(null);
      setStatus("ready");
    } catch (nextError) {
      if (credential) await deleteUser(credential.user).catch(() => firebaseSignOut(auth));
      setSession(null);
      setStatus("signedOut");
      throw new Error(authErrorMessage(nextError));
    } finally {
      registrationInProgress.current = false;
    }
  }, []);

  const signOut = useCallback(async () => {
    const { auth } = firebaseServices();
    await firebaseSignOut(auth);
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    if (!email.trim()) throw new Error("Şifre sıfırlama bağlantısı için e-posta adresini yazın.");
    try { await sendPasswordResetEmail(firebaseServices().auth, email.trim()); }
    catch (nextError) { throw new Error(authErrorMessage(nextError)); }
  }, []);

  const refreshSession = useCallback(async () => {
    const { auth } = firebaseServices();
    if (!auth.currentUser) throw new Error("Oturum bulunamadı.");
    await auth.currentUser.getIdToken(true);
    setSession(await workspaceFor(auth.currentUser));
  }, []);

  const value = useMemo(
    () => ({ session, status, error, signIn, createAccount, resetPassword, refreshSession, signOut }),
    [session, status, error, signIn, createAccount, resetPassword, refreshSession, signOut],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must be used inside SessionProvider.");
  return value;
}
