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
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  updateProfile,
  type User as FirebaseUser,
} from "firebase/auth";
import { createCommandId } from "@spherepath/shared";
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
  refreshSession(): Promise<void>;
  signOut(): Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

function messageFrom(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error) {
    switch (error.code) {
      case "auth/invalid-credential":
      case "auth/wrong-password":
      case "auth/user-not-found":
        return "E-posta veya şifre hatalı.";
      case "auth/too-many-requests":
        return "Çok fazla başarısız deneme yapıldı. Biraz sonra yeniden deneyin.";
      case "auth/network-request-failed":
        return "Bağlantı kurulamadı. İnternet bağlantınızı kontrol edip yeniden deneyin.";
      default:
        break;
    }
  }
  return error instanceof Error ? error.message : "Beklenmeyen bir oturum hatası oluştu.";
}

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
    return onAuthStateChanged(auth, async (user) => {
      if (registrationInProgress.current) return;
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
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (nextError) {
      setStatus("signedOut");
      throw new Error(messageFrom(nextError));
    }
  }, []);

  const createAccount = useCallback(async (displayName: string, email: string, password: string, inviteCode?: string) => {
    const { auth } = firebaseServices();
    registrationInProgress.current = true;
    setStatus("loading");
    let credential: Awaited<ReturnType<typeof createUserWithEmailAndPassword>> | null = null;
    try {
      credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
      await updateProfile(credential.user, { displayName: displayName.trim() });
      setSession(await workspaceFor(credential.user, displayName, inviteCode));
      setStatus("ready");
    } catch (nextError) {
      if (credential) await deleteUser(credential.user).catch(() => firebaseSignOut(auth));
      setSession(null);
      setStatus("signedOut");
      throw nextError;
    } finally {
      registrationInProgress.current = false;
    }
  }, []);

  const signOut = useCallback(async () => {
    const { auth } = firebaseServices();
    await firebaseSignOut(auth);
  }, []);

  const refreshSession = useCallback(async () => {
    const { auth } = firebaseServices();
    if (!auth.currentUser) throw new Error("Oturum bulunamadı.");
    await auth.currentUser.getIdToken(true);
    setSession(await workspaceFor(auth.currentUser));
  }, []);

  const value = useMemo(
    () => ({ session, status, error, signIn, createAccount, refreshSession, signOut }),
    [session, status, error, signIn, createAccount, refreshSession, signOut],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must be used inside SessionProvider.");
  return value;
}
