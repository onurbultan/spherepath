"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell } from "@/shared/ui/AppShell";
import { SpCard } from "@/shared/ui/SpCard";

/**
 * A single-member roster and one invite code do not earn a place in the primary
 * navigation; the office is a setting of the workspace. The route stays for
 * links already in the wild.
 */
export function TeamView() {
  const router = useRouter();
  useEffect(() => { router.replace("/settings?section=office"); }, [router]);
  return <AppShell><SpCard className="empty-state">
    <h2>Ekip, Ayarlar ekranına taşındı</h2>
    <p>Ofis üyeleri ve davet kodu artık “Ofis ve ekip” sekmesinde. Yönlendiriliyorsun…</p>
    <Link className="primary-action inline-link" href="/settings?section=office">Ayarlar ve ekip</Link>
  </SpCard></AppShell>;
}
