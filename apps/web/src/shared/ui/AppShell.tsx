"use client";

import type { ReactNode } from "react";
import { BriefcaseBusiness, ContactRound, House, ListTodo, Plus, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "@/features/auth/resources/session";

const navigation = [
  { label: "Bugün", icon: ListTodo, href: "/" },
  { label: "Kişiler", icon: ContactRound, href: "/contacts" },
  { label: "Fırsatlar", icon: BriefcaseBusiness, href: "/opportunities" },
  { label: "Portföy", icon: House, href: "/listings" },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { session, signOut } = useSession();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-mark" aria-label="Spherepath">
          <span className="brand-symbol">S</span>
          <div><strong>Spherepath</strong><small>{session?.displayName}</small></div>
        </div>
        <nav aria-label="Ana navigasyon">
          {navigation.map(({ label, icon: Icon, href }) => (
            <Link key={label} href={href} className={pathname === href ? "nav-item active" : "nav-item"}>
              <Icon size={19} aria-hidden /> {label}
            </Link>
          ))}
        </nav>
        <button type="button" className="nav-item settings" onClick={() => void signOut()}><Settings size={19} aria-hidden /> Oturumu kapat</button>
      </aside>
      <main className="main-content">{children}</main>
      <Link href="/capture" className="record-button" aria-label="Yeni kayıt"><Plus size={28} aria-hidden /></Link>
    </div>
  );
}
