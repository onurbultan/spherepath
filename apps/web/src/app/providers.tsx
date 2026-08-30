"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { apiRetryDelay, shouldRetryApiCall } from "@spherepath/shared";
import { usePathname } from "next/navigation";
import { AuthView } from "@/features/auth/views/AuthView";
import { SessionProvider, useSession } from "@/features/auth/resources/session";

const publicPaths = new Set(["/privacy", "/terms", "/data-deletion"]);

function SessionGate({ children }: { children: ReactNode }) {
  const { status, error, signOut } = useSession();
  const pathname = usePathname();

  if (publicPaths.has(pathname.replace(/\/$/u, "") || "/")) return children;

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
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: { staleTime: 60_000, retry: shouldRetryApiCall, retryDelay: apiRetryDelay },
      mutations: { retry: false },
    },
  }));
  return <QueryClientProvider client={queryClient}><SessionProvider><SessionGate>{children}</SessionGate></SessionProvider></QueryClientProvider>;
}
