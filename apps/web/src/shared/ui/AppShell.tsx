import type { ReactNode } from "react";
import { BriefcaseBusiness, ContactRound, House, ListTodo, Plus, Settings } from "lucide-react";

const navigation = [
  { label: "Bugün", icon: ListTodo, active: true },
  { label: "Kişiler", icon: ContactRound, active: false },
  { label: "Fırsatlar", icon: BriefcaseBusiness, active: false },
  { label: "Portföy", icon: House, active: false },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-mark" aria-label="Spherepath">
          <span className="brand-symbol">S</span>
          <div><strong>Spherepath</strong><small>Çalışma alanı</small></div>
        </div>
        <nav aria-label="Ana navigasyon">
          {navigation.map(({ label, icon: Icon, active }) => (
            <button key={label} type="button" className={active ? "nav-item active" : "nav-item"}>
              <Icon size={19} aria-hidden /> {label}
            </button>
          ))}
        </nav>
        <button type="button" className="nav-item settings"><Settings size={19} aria-hidden /> Ayarlar</button>
      </aside>
      <main className="main-content">{children}</main>
      <button type="button" className="record-button" aria-label="Yeni kayıt"><Plus size={28} aria-hidden /></button>
    </div>
  );
}
