import type { ReportingPeriod } from "../today/build-overview.js";

export interface FunnelCounts {
  newPeople: number;
  leads: number;
  appointments: number;
  portfolioMeetings: number;
  authorizedListings: number;
  negotiations: number;
  closings: number;
}

export interface FunnelCoaching {
  title: string;
  explanation: string;
  script: string;
  target: "capture" | "contacts" | "opportunities" | "listings";
}

export interface FunnelOverview {
  period: ReportingPeriod;
  counts: FunnelCounts;
  coaching: FunnelCoaching;
}

export function buildFunnelCoaching(counts: FunnelCounts): FunnelCoaching {
  if (counts.newPeople < 5 && counts.leads === 0) {
    return { title: "Önce birkaç gerçek kayıt topla", explanation: "Sağlıklı bir yönlendirme için en az beş yeni kişi veya görüşme kaydı gerekli.", script: "Bugün tanıştığın kişileri tek cümleyle Akış'a kaydet.", target: "capture" };
  }
  if (counts.newPeople > 0 && counts.leads === 0) {
    return { title: "Tanışmayı gayrimenkul konuşmasına çevir", explanation: `${counts.newPeople} yeni kişi var; henüz talep oluşmamış. Görüşmede ihtiyacı ve çevresindeki fırsatları sormayı dene.`, script: "Çevrenizde evini satmayı düşünen veya yeni bir yer arayan biri var mı?", target: "contacts" };
  }
  if (counts.leads > 0 && counts.appointments === 0) {
    return { title: "Talebi randevuya taşı", explanation: `${counts.leads} talep var; randevu yok. Tanıştırma veya doğrudan görüşme izni iste.`, script: "Beni kendisiyle tanıştırabilir misin? Kısa bir görüşme yapmam ikimiz için de çok faydalı olur.", target: "opportunities" };
  }
  if (counts.appointments > 0 && counts.authorizedListings === 0) {
    return { title: "Randevuda değer ve yetkiyi netleştir", explanation: `${counts.appointments} randevuya rağmen yetkili portföy oluşmamış. Değerleme ve çalışma biçimini açıkça konuş.`, script: "Doğru fiyat ve pazarlama planını birlikte netleştirelim; yetkiyle çalışırsak süreci tek elden yönetebilirim.", target: "opportunities" };
  }
  if (counts.authorizedListings > 0 && counts.closings === 0) {
    return { title: "Portföyü görüşmeye ve teklife taşı", explanation: `${counts.authorizedListings} yetkili portföy var; kapanış yok. Eşleşmeleri, sunumları ve teklif takibini sırala.`, script: "Bu portföy için en uygun üç kişiyi bugün arayıp gösterim zamanını netleştirelim.", target: "listings" };
  }
  return { title: "Akış çalışıyor; ritmi koru", explanation: `${counts.closings} kapanışa ulaştın. Yeni kişi ve takip kayıtlarını aksatmadan aynı döngüyü sürdür.`, script: "Bugünün beşini tamamla, sonra yeni fırsatları Akış'a ekle.", target: "capture" };
}
