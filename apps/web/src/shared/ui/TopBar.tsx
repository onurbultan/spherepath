"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Moon, NotebookPen, Search, Sun } from "lucide-react";
import { apiQueryKeys, type PortfolioMatchNotificationRecord } from "@spherepath/shared";
import { useSession } from "@/features/auth/resources/session";
import { listMatchNotifications, markMatchNotificationsRead } from "@/features/matching/resources/portfolio";
import { AccountMenu } from "./AccountMenu";
import { useThemePreference } from "./theme";

/**
 * The page names itself in its own heading. A one-level breadcrumb above it
 * repeated that word and led nowhere, so the bar carries only what the heading
 * cannot: search, appearance, notifications and the single capture action,
 * which opens the day's page.
 */
export function TopBar({ pathname, onOpenSearch }: { pathname: string; onOpenSearch(): void }) {
  const { session } = useSession();
  const queryClient = useQueryClient();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [preference, setPreference] = useThemePreference();
  const dark = preference === "dark" || (preference === "system" && typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  const notificationsQuery = useQuery({ queryKey: apiQueryKeys.matchNotifications, queryFn: listMatchNotifications, enabled: Boolean(session), staleTime: 60_000, refetchInterval: 60_000 });
  const notifications = notificationsQuery.data ?? [];
  const unread = notifications.filter((item) => item.readAt === null);

  async function toggleNotifications() {
    const opening = !notificationsOpen;
    setNotificationsOpen(opening);
    if (!opening || !session) return;
    void notificationsQuery.refetch();
    if (!unread.length) return;
    try {
      await markMatchNotificationsRead(session, unread.map((item) => item.id));
      const now = Date.now();
      queryClient.setQueryData<PortfolioMatchNotificationRecord[]>(apiQueryKeys.matchNotifications, (current) => current?.map((item) => item.readAt === null ? { ...item, readAt: now } : item));
    } catch {
      // The list remains usable if the read receipt cannot be persisted.
    }
  }

  return (
    <header className="app-topbar">
      <div className="topbar-inner">
      <button type="button" className="topbar-search" onClick={onOpenSearch}>
        <Search size={15} aria-hidden />
        <span>Kişi, iş veya portföy ara</span>
        <span className="topbar-kbd" aria-hidden>⌘K</span>
      </button>

      <div className="topbar-spacer" />

      <div className="topbar-actions">
        <button className="topbar-icon-button" aria-label={dark ? "Açık temaya geç" : "Koyu temaya geç"} onClick={() => setPreference(dark ? "light" : "dark")} type="button">
          {dark ? <Sun size={16} aria-hidden /> : <Moon size={16} aria-hidden />}
        </button>
        <div className="notification-wrap">
          <button className="topbar-icon-button notification-button" aria-expanded={notificationsOpen} aria-label={unread.length ? `${unread.length} yeni eşleşme bildirimi` : "Eşleşme bildirimleri"} onClick={() => void toggleNotifications()} title="Eşleşme bildirimleri" type="button">
            <Bell size={16} aria-hidden />{unread.length ? <span aria-hidden /> : null}
          </button>
          {notificationsOpen ? <div className="notification-popover" role="dialog" aria-label="Eşleşme bildirimleri"><div className="notification-heading"><div><strong>Eşleşmeler</strong><span>{notifications.length ? `${notifications.length} güncel eşleşme` : "Yeni bildirim yok"}</span></div><Link href="/listings?view=pool" onClick={() => setNotificationsOpen(false)}>Tümünü gör</Link></div>{notificationsQuery.isPending ? <div className="notification-empty">Eşleşmeler taranıyor…</div> : notificationsQuery.error ? <div className="notification-empty" role="alert">Eşleşmeler yüklenemedi. <button type="button" onClick={() => void notificationsQuery.refetch()}>Yeniden dene</button></div> : notifications.length ? <div className="notification-list">{notifications.slice(0, 5).map((item) => <Link href="/listings?view=pool" key={item.id} onClick={() => setNotificationsOpen(false)}><span className="notification-score">%{item.match.score}</span><span><strong>{item.match.contactName}</strong><small>{item.match.portfolioItem.headline}</small></span></Link>)}</div> : <div className="notification-empty">Yeni bir alıcı–portföy eşleşmesi oluştuğunda burada görünecek.</div>}</div> : null}
        </div>
        <div className="topbar-mobile-account"><AccountMenu /></div>
        {/* The one capture action in the bar, and it opens the day's page. Two
            front doors is one too many: the sidebar said the page and this said
            the form, so the advisor had to guess which one the product meant. */}
        <Link className="primary-action inline-action compact-action" href="/note" data-active={pathname === "/note" ? "true" : undefined}>
          <NotebookPen size={15} aria-hidden /> Günlük not
        </Link>
      </div>
      </div>
    </header>
  );
}
