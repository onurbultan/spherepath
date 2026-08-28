import { CalendarCheck, ContactRound, House, Sparkles, Target } from "lucide-react";
import { AppShell } from "@/shared/ui/AppShell";
import { SpCard } from "@/shared/ui/SpCard";

const stages = [
  { label: "Tanışma", value: "0", detail: "Bu hafta" },
  { label: "İlişki", value: "0", detail: "Anlamlı temas" },
  { label: "Lead", value: "0", detail: "Nitelikli fırsat" },
  { label: "Portföy", value: "0", detail: "Yetkili portföy" },
  { label: "Kapama", value: "0", detail: "Tamamlanan işlem" },
] as const;

export default function TodayPage() {
  return (
    <AppShell>
      <header className="page-header">
        <p className="eyebrow">BUGÜN · 28 AĞUSTOS</p>
        <h1>Bugünün odağı</h1>
        <p className="context-sentence">
          Henüz ölçüm oluşturacak temas yok. İlk görüşmeni kaydettiğinde Spherepath odağını açıklayacak.
        </p>
      </header>

      <section aria-labelledby="health-title" className="section-stack">
        <div className="section-heading">
          <div>
            <p className="eyebrow">SATIŞ SİSTEMİ</p>
            <h2 id="health-title">Beş aşamalı sağlık</h2>
          </div>
          <span className="period-chip">SON 30 GÜN</span>
        </div>
        <div className="stage-grid">
          {stages.map((stage) => (
            <SpCard key={stage.label} className="stage-card">
              <span className="stage-label">{stage.label}</span>
              <strong>{stage.value}</strong>
              <span>{stage.detail}</span>
            </SpCard>
          ))}
        </div>
      </section>

      <section className="two-column-grid">
        <SpCard className="focus-card">
          <div className="card-icon"><Target size={18} aria-hidden /></div>
          <p className="eyebrow">DARBOĞAZ</p>
          <h2>Başlamak için veri gerekiyor</h2>
          <p>
            En az birkaç gerçek temas kaydından sonra dönem, payda ve aşama süresine göre tek bir odak göstereceğiz.
          </p>
          <button type="button" className="primary-action">İlk teması kaydet</button>
        </SpCard>

        <SpCard>
          <div className="card-icon secondary"><CalendarCheck size={18} aria-hidden /></div>
          <p className="eyebrow">GÜNLÜK PLAN</p>
          <h2>Bugün için görev yok</h2>
          <p>Sonraki adımı olan kişi ve fırsatlar burada en fazla beş eylem olarak sıralanacak.</p>
          <ul className="placeholder-list" aria-label="Görev türleri">
            <li><ContactRound size={17} aria-hidden /> Anlamlı temas</li>
            <li><Sparkles size={17} aria-hidden /> Değer sunma</li>
            <li><House size={17} aria-hidden /> Fırsatı ilerletme</li>
          </ul>
        </SpCard>
      </section>
    </AppShell>
  );
}
