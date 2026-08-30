"use client";

import { AppShell } from "@/shared/ui/AppShell";
import { OfficeTeamPanel } from "../components/OfficeTeamPanel";

export function TeamView() {
  return <AppShell><div className="team-view">
    <header className="page-header"><p className="eyebrow">OFİS</p><h1>Ekip</h1><p className="context-sentence">Ekip üyelerini gör, danışman davetlerini oluştur ve çalışma alanı bağlantısını yönet.</p></header>
    <OfficeTeamPanel />
  </div></AppShell>;
}
