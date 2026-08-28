import { AppShell } from "@/shared/ui/AppShell";
import { SpCard } from "@/shared/ui/SpCard";

export default function ListingsPage() {
  return <AppShell><header className="page-header"><p className="eyebrow">AKTİF ENVANTER</p><h1>Portföy</h1></header><SpCard className="empty-state"><h2>Henüz aktif portföy yok</h2><p>Kazanılan fırsatlar burada portföy kaydına dönüşecek.</p></SpCard></AppShell>;
}
