"use client";

import { useEffect, useState, type ReactNode } from "react";
import { BriefcaseBusiness, ContactRound, Handshake, House, ListTodo, Network, Plus, SlidersHorizontal, Users } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { apiQueryKeys } from "@spherepath/shared";
import { useSession } from "@/features/auth/resources/session";
import { listContacts } from "@/features/contacts/resources/contacts";
import { listOpportunities } from "@/features/opportunities/resources/opportunities";
import { listListings } from "@/features/listings/resources/listings";
import { listPortfolioItems } from "@/features/matching/resources/portfolio";
import { loadOfficeTeam } from "@/features/settings/resources/settings";
import { AccountMenu } from "./AccountMenu";
import { CommandPalette } from "./CommandPalette";
import { ConnectivityBanner } from "./ConnectivityBanner";
import { TopBar } from "./TopBar";

const workNavigation = [
  { label: "Bugün", icon: ListTodo, href: "/", count: null },
  { label: "Kişiler", icon: ContactRound, href: "/contacts", count: "contacts" },
  { label: "Fırsatlar", icon: BriefcaseBusiness, href: "/opportunities", count: "opportunities" },
  { label: "Portföy", icon: House, href: "/listings", count: "listings" },
  { label: "Kapama", icon: Handshake, href: "/closing", count: null },
] as const;

const officeNavigation = [
  { label: "Ofis havuzu", icon: Network, href: "/listings#office-pool", count: "portfolioItems" },
  { label: "Ekip", icon: Users, href: "/settings#office-team", count: "team" },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { session } = useSession();
  const [paletteOpen, setPaletteOpen] = useState(false);

  // `enabled: false` subscribes to whatever a visited page already cached
  // without ever issuing a request of its own, so the counts are free.
  const contacts = useQuery({ queryKey: apiQueryKeys.contacts, queryFn: listContacts, enabled: false });
  const opportunities = useQuery({ queryKey: apiQueryKeys.opportunities, queryFn: listOpportunities, enabled: false });
  const listings = useQuery({ queryKey: apiQueryKeys.listings, queryFn: listListings, enabled: false });
  const portfolioItems = useQuery({ queryKey: apiQueryKeys.portfolioItems, queryFn: listPortfolioItems, enabled: false });
  const team = useQuery({ queryKey: apiQueryKeys.officeTeam, queryFn: loadOfficeTeam, enabled: Boolean(session) });
  const counts: Record<string, number | undefined> = {
    contacts: contacts.data?.length,
    opportunities: opportunities.data?.filter((item) => item.stage !== "won" && item.stage !== "lost").length,
    listings: listings.data?.filter((item) => item.status === "active" || item.status === "reserved").length,
    portfolioItems: portfolioItems.data?.length,
    team: team.data?.members.length,
  };

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setPaletteOpen((current) => !current);
      } else if (event.shiftKey && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "v") {
        event.preventDefault();
        setPaletteOpen(false);
        router.push("/capture");
      } else if (event.shiftKey && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        setPaletteOpen(false);
        router.push("/opportunities?create=1");
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [router]);

  function navItem({ label, icon: Icon, href, count }: { label: string; icon: typeof ListTodo; href: string; count: string | null }) {
    const route = href.split("#")[0] ?? href;
    const active = pathname === route && !href.includes("#");
    const value = count ? counts[count] : undefined;
    return (
      <Link key={href} href={href} className={active ? "nav-item active" : "nav-item"} aria-current={active ? "page" : undefined}>
        <Icon size={17} aria-hidden />
        <span>{label}</span>
        {value !== undefined ? <span className="nav-count">{value}</span> : null}
      </Link>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-mark" aria-label="Spherepath">
          <span className="brand-symbol" aria-hidden>S</span>
          <div>
            <strong>Spherepath</strong>
            <small>{team.data?.officeName ?? "Çalışma alanı"}</small>
          </div>
        </div>

        <nav aria-label="Ana navigasyon">
          <div className="nav-group">
            <span className="nav-group-label">Çalışma</span>
            {workNavigation.map(navItem)}
          </div>
          <div className="nav-group nav-group-office">
            <span className="nav-group-label">Ofis</span>
            {officeNavigation.map(navItem)}
          </div>
        </nav>

        <div className="sidebar-footer">
          <Link href="/settings" className={pathname === "/settings" ? "nav-item active" : "nav-item"} aria-current={pathname === "/settings" ? "page" : undefined}>
            <SlidersHorizontal size={17} aria-hidden />
            <span>Ayarlar ve uyum</span>
          </Link>
          <div className="sidebar-separator" aria-hidden />
          <AccountMenu />
        </div>
      </aside>

      <div className="app-frame">
        <TopBar pathname={pathname} onOpenSearch={() => setPaletteOpen(true)} />
        <main className="main-content">
          <ConnectivityBanner />
          {children}
        </main>
      </div>

      {pathname === "/capture" ? null : <Link href="/capture" className="record-button" aria-label="Yeni kayıt"><Plus size={26} aria-hidden /></Link>}
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
