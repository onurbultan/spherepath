"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, LogOut, Monitor, Moon, Settings, Sun } from "lucide-react";
import { useSession } from "@/features/auth/resources/session";
import { useThemePreference, type ThemePreference } from "./theme";

const themeOptions: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: "system", label: "Sistem teması", icon: Monitor },
  { value: "light", label: "Açık tema", icon: Sun },
  { value: "dark", label: "Koyu tema", icon: Moon },
];

const roleLabels = { agent: "Gayrimenkul danışmanı", broker: "Broker · ofis yöneticisi" } as const;

export function AccountMenu() {
  const { session, signOut } = useSession();
  const [open, setOpen] = useState(false);
  const [preference, setPreference] = useThemePreference();
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (!session) return null;
  const initial = (session.displayName || "?").slice(0, 1).toLocaleUpperCase("tr-TR");

  return (
    <div className="account-menu" ref={container}>
      <button
        type="button"
        className="account-trigger"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Hesap menüsü"
        onClick={() => setOpen((current) => !current)}
      >
        <span className="account-avatar" aria-hidden>{initial}</span>
        <span className="account-name">{session.displayName}</span>
        <ChevronDown size={14} aria-hidden />
      </button>

      {open ? (
        <div className="account-popover" role="menu">
          <div className="account-identity">
            <strong>{session.displayName}</strong>
            <span>{roleLabels[session.role]}</span>
          </div>

          <div className="account-theme">
            <span>Tema</span>
            <div className="theme-switch">
              {themeOptions.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={preference === value}
                  aria-label={label}
                  title={label}
                  onClick={() => setPreference(value)}
                >
                  <Icon size={14} aria-hidden />
                </button>
              ))}
            </div>
          </div>

          <Link className="account-item" href="/settings" role="menuitem" onClick={() => setOpen(false)}>
            <Settings size={16} aria-hidden /> Ayarlar ve uyum
          </Link>
          <button className="account-item danger" type="button" role="menuitem" onClick={() => void signOut()}>
            <LogOut size={16} aria-hidden /> Oturumu kapat
          </button>
        </div>
      ) : null}
    </div>
  );
}
