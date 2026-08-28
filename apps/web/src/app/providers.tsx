"use client";

import type { ReactNode } from "react";
import { AuthView } from "@/features/auth/views/AuthView";
import { SessionProvider, useSession } from "@/features/auth/resources/session";

function SessionGate({ children }: { children: ReactNode }) {
  const { status, error, signOut } = useSession();

  if (status === "loading") {
    return <main className="session-state"><span className="brand-symbol">S</span><p>Çalışma alanın hazırlanıyor…</p></main>;
  }
  if (status === "signedOut") return <AuthView />;
  if (status === "error") {
    return <main className="session-state"><h1>Çalışma alanı açılamadı</h1><p>{error}</p><button className="secondary-action" onClick={() => void signOut()} type="button">Oturumu kapat</button></main>;
  }
  return children;
}

export function AppProviders({ children }: { children: ReactNode }) {
  return <SessionProvider><SessionGate>{children}</SessionGate></SessionProvider>;
}
