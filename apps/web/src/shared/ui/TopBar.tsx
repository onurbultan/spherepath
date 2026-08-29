"use client";

import Link from "next/link";
import { Bell, ChevronRight, Moon, Plus, Search, Sun } from "lucide-react";
import { useThemePreference } from "./theme";

const pageTitles: Record<string, string> = {
  "/": "Bugün",
  "/contacts": "Kişiler",
  "/opportunities": "Fırsatlar",
  "/listings": "Portföy",
  "/capture": "Temas kaydet",
  "/settings": "Ayarlar ve uyum",
};

export function TopBar({ pathname, onOpenSearch }: { pathname: string; onOpenSearch(): void }) {
  const title = pageTitles[pathname] ?? "Çalışma alanı";
  const [preference, setPreference] = useThemePreference();
  const dark = preference === "dark" || (preference === "system" && typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches);

  return (
    <header className="app-topbar">
      <nav className="topbar-crumbs" aria-label="Konum">
        <span>Çalışma alanı</span>
        <ChevronRight size={13} aria-hidden />
        <strong aria-current="page">{title}</strong>
      </nav>

      <div className="topbar-spacer" />

      <button type="button" className="topbar-search" onClick={onOpenSearch}>
        <Search size={15} aria-hidden />
        <span>Kişi, fırsat veya portföy ara</span>
        <span className="topbar-kbd" aria-hidden>⌘K</span>
      </button>

      <div className="topbar-divider" aria-hidden />

      <div className="topbar-actions">
        <button className="topbar-icon-button" aria-label={dark ? "Açık temaya geç" : "Koyu temaya geç"} onClick={() => setPreference(dark ? "light" : "dark")} type="button">
          {dark ? <Sun size={16} aria-hidden /> : <Moon size={16} aria-hidden />}
        </button>
        <button className="topbar-icon-button notification-button" aria-label="Bildirimler henüz etkin değil" disabled title="Bildirim merkezi sonraki sürümde etkinleşecek" type="button">
          <Bell size={16} aria-hidden /><span aria-hidden />
        </button>
        <Link className="primary-action inline-action compact-action" href="/capture">
          <Plus size={15} aria-hidden /> Temas kaydet
        </Link>
      </div>
    </header>
  );
}
