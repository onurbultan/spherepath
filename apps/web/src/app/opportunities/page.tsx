import { AppShell } from "@/shared/ui/AppShell";
import { SpCard } from "@/shared/ui/SpCard";

export default function OpportunitiesPage() {
  return <AppShell><header className="page-header"><p className="eyebrow">PORTFÖY ÜRETİMİ</p><h1>Fırsatlar</h1></header><SpCard className="empty-state"><h2>Fırsat pipeline’ı sıradaki dikey parça</h2><p>Kişiler ve temas kayıtları üzerine güvenli aşama geçişleri eklenecek.</p></SpCard></AppShell>;
}
