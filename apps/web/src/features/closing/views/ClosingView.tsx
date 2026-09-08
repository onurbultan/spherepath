"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell } from "@/shared/ui/AppShell";
import { SpCard } from "@/shared/ui/SpCard";

/**
 * Marketing a mandate and closing on it are the second half of the pipeline
 * that starts with a request, so they moved onto İşler. The route stays for
 * links already in the wild and sends them to their new home.
 */
export function ClosingView() {
  const router = useRouter();
  useEffect(() => { router.replace("/opportunities#closing"); }, [router]);
  return <AppShell><SpCard className="empty-state">
    <h2>Sunum ve işlemler İşler ekranına taşındı</h2>
    <p>Talepten kapanışa kadar tek akış oldu. Yönlendiriliyorsun…</p>
    <Link className="primary-action inline-link" href="/opportunities#closing">İşler ekranını aç</Link>
  </SpCard></AppShell>;
}
