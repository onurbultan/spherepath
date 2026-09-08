"use client";

import { useEffect, useRef, useState, type ReactNode, type TouchEvent } from "react";
import { BriefcaseBusiness, ContactRound, House, ListTodo, Plus, Pyramid, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { apiQueryKeys, type TodayOverview } from "@spherepath/shared";
import { useSession } from "@/features/auth/resources/session";
import { listContacts } from "@/features/contacts/resources/contacts";
import { listOpportunities } from "@/features/opportunities/resources/opportunities";
import { listListings } from "@/features/listings/resources/listings";
import { loadOfficeTeam } from "@/features/settings/resources/settings";
import { loadTodayOverview } from "@/features/today/resources/today";
import { AccountMenu } from "./AccountMenu";
import { CommandPalette } from "./CommandPalette";
import { ConnectivityBanner } from "./ConnectivityBanner";
import { TopBar } from "./TopBar";

/**
 * One list, in the order the bottom tab bar needs it. Capture is a destination
 * only on a phone -- on a desktop it is the top bar's single action -- and the
 * funnel is a diagnosis rather than a place work happens, so the bar drops it
 * to the account sheet. Hiding either is CSS; the set stays the same so a
 * capability never becomes unreachable on one screen size.
 */
const navigation = [
  { label: "Bugün", icon: ListTodo, href: "/", count: "today" },
  { label: "Kişiler", icon: ContactRound, href: "/contacts", count: "contacts" },
  { label: "Temas kaydet", icon: Plus, href: "/capture", count: null },
  { label: "İşler", icon: BriefcaseBusiness, href: "/opportunities", count: "work" },
  { label: "Portföy", icon: House, href: "/listings", count: "listings" },
  { label: "Huni", icon: Pyramid, href: "/funnel", count: null },
] as const;

const swipePaths = ["/", "/contacts", "/capture", "/opportunities", "/listings"] as const;

/** End of the current day: anything due at or before it is work for today. */
function endOfToday(): number {
  const date = new Date();
  date.setHours(23, 59, 59, 999);
  return date.getTime();
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const currentPathname = pathname === "/" ? pathname : pathname.replace(/\/+$/, "");
  const router = useRouter();
  const { session } = useSession();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [swipeDirection, setSwipeDirection] = useState<"next" | "previous" | null>(null);
  const touchStart = useRef<{ x: number; y: number; at: number; blocked: boolean } | null>(null);

  // `enabled: false` subscribes to whatever a visited page already cached
  // without ever issuing a request of its own, so the counts are free.
  const contacts = useQuery({ queryKey: apiQueryKeys.contacts, queryFn: listContacts, enabled: false });
  const opportunities = useQuery({ queryKey: apiQueryKeys.opportunities, queryFn: listOpportunities, enabled: false });
  const listings = useQuery({ queryKey: apiQueryKeys.listings, queryFn: listListings, enabled: false });
  const today = useQuery<TodayOverview>({ queryKey: apiQueryKeys.todayOverviewPeriod("30d"), queryFn: () => loadTodayOverview("30d"), enabled: false });
  const team = useQuery({ queryKey: apiQueryKeys.officeTeam, queryFn: loadOfficeTeam, enabled: Boolean(session) });

  const dueToday = today.data ? today.data.overdueTasks.length + today.data.todayTasks.length : undefined;
  const openWork = opportunities.data?.filter((item) => item.stage !== "won" && item.stage !== "lost");
  const workNeedingAction = openWork?.filter((item) => item.nextActionAt !== null && item.nextActionAt <= endOfToday()).length ?? 0;
  // A number that means "act on me" is not the same number as an inventory
  // total, so it is not allowed to look like one.
  const counts: Record<string, { value: number | undefined; urgent: boolean }> = {
    today: { value: dueToday, urgent: (today.data?.overdueTasks.length ?? 0) > 0 },
    contacts: { value: contacts.data?.length, urgent: false },
    work: { value: workNeedingAction || openWork?.length, urgent: workNeedingAction > 0 },
    listings: { value: listings.data?.filter((item) => item.status === "preparing" || item.status === "active" || item.status === "reserved").length, urgent: false },
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
    const active = currentPathname === href;
    const badge = count ? counts[count] : undefined;
    return (
      <Link key={href} href={href} className={`${active ? "nav-item active" : "nav-item"}${href === "/capture" ? " nav-capture" : ""}${href === "/funnel" ? " nav-desktop-only" : ""}`} aria-current={active ? "page" : undefined}>
        <Icon size={17} aria-hidden />
        <span>{label}</span>
        {badge?.value !== undefined ? <span className={badge.urgent ? "nav-count urgent" : "nav-count"}>{badge.value}</span> : null}
      </Link>
    );
  }

  function swipeBlocked(target: EventTarget | null) {
    return target instanceof Element && Boolean(target.closest("input, textarea, select, button, a, [role='dialog'], [data-no-page-swipe], .contact-segments, .settings-subnav, .work-stage-strip"));
  }

  function onTouchStart(event: TouchEvent<HTMLDivElement>) {
    if (window.innerWidth > 900 || event.touches.length !== 1) return;
    const point = event.touches[0];
    if (!point) return;
    touchStart.current = { x: point.clientX, y: point.clientY, at: Date.now(), blocked: swipeBlocked(event.target) };
  }

  function onTouchEnd(event: TouchEvent<HTMLDivElement>) {
    const start = touchStart.current; touchStart.current = null;
    if (!start || start.blocked || window.innerWidth > 900 || event.changedTouches.length !== 1) return;
    const point = event.changedTouches[0];
    if (!point) return;
    const dx = point.clientX - start.x; const dy = point.clientY - start.y; const elapsed = Math.max(1, Date.now() - start.at);
    if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.6 || Math.abs(dx) / elapsed < 0.18) return;
    const current = swipePaths.indexOf(currentPathname as (typeof swipePaths)[number]);
    if (current < 0) return;
    const destination = Math.max(0, Math.min(swipePaths.length - 1, current + (dx < 0 ? 1 : -1)));
    const href = swipePaths[destination];
    if (!href || destination === current) return;
    setSwipeDirection(dx < 0 ? "next" : "previous");
    router.push(href);
    window.setTimeout(() => setSwipeDirection(null), 220);
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
          <div className="nav-group">{navigation.map(navItem)}</div>
        </nav>

        <div className="sidebar-footer">
          <Link href="/settings" className={currentPathname === "/settings" ? "nav-item active" : "nav-item"} aria-current={currentPathname === "/settings" ? "page" : undefined}>
            <SlidersHorizontal size={17} aria-hidden />
            <span>Ayarlar ve ekip</span>
          </Link>
          <div className="sidebar-separator" aria-hidden />
          <AccountMenu />
        </div>
      </aside>

      <div className={`app-frame${swipeDirection ? ` page-swipe-${swipeDirection}` : ""}`} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <TopBar pathname={currentPathname} onOpenSearch={() => setPaletteOpen(true)} />
        <main className="main-content">
          <ConnectivityBanner session={session} />
          {children}
        </main>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
