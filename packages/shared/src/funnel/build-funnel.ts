import type { EarningsSummary } from "../closing/earnings.js";
import type { FunnelMetrics } from "./funnel-metrics.js";
import type { ReportingPeriod } from "../today/build-overview.js";
import type { OpportunityType } from "../domain/entities.js";

export interface FunnelCounts {
  newPeople: number;
  leads: number;
  appointments: number;
  portfolioMeetings: number;
  authorizedListings: number;
  negotiations: number;
  closings: number;
}

/** The actual record the advice is about, so the advisor is not left asking "which one?". */
export interface FunnelCoachingSubject {
  kind: "contact" | "opportunity" | "listing";
  id: string;
  name: string;
  /** Why this record was picked, e.g. "24 gündür randevu aşamasında". */
  detail: string;
  opportunityType?: OpportunityType;
  introduced?: boolean;
}

/**
 * Candidates the caller resolves once; each branch of the advice picks the one that
 * answers its own question. Passing them in keeps the branch logic in one place.
 */
export interface FunnelSubjects {
  newestUncontactedContact: FunnelCoachingSubject | null;
  oldestOpportunityWithoutAppointment: FunnelCoachingSubject | null;
  oldestAppointmentWithoutMandate: FunnelCoachingSubject | null;
  oldestUnreadyListing: FunnelCoachingSubject | null;
  oldestActiveListing: FunnelCoachingSubject | null;
}

export const emptyFunnelSubjects: FunnelSubjects = {
  newestUncontactedContact: null,
  oldestOpportunityWithoutAppointment: null,
  oldestAppointmentWithoutMandate: null,
  oldestUnreadyListing: null,
  oldestActiveListing: null,
};

export interface FunnelCoaching {
  title: string;
  explanation: string;
  script: string;
  target: "capture" | "contacts" | "opportunities" | "listings";
  subject: FunnelCoachingSubject | null;
}

export interface FunnelTargetProgress {
  /** Monthly portfolio target the advisor set in settings; null while unset. */
  monthlyTarget: number | null;
  /** That monthly target scaled to the selected reporting period. */
  periodTarget: number | null;
  achieved: number;
  /** Achieved over target; null while no target is set. */
  ratio: number | null;
}

export interface FunnelOverview {
  period: ReportingPeriod;
  counts: FunnelCounts;
  coaching: FunnelCoaching;
  earnings: EarningsSummary;
  target: FunnelTargetProgress;
  metrics: FunnelMetrics;
}

const targetMonths: Record<ReportingPeriod, number> = { "30d": 1, "90d": 3, "1y": 12 };

/** Compares authorized listings against the monthly portfolio target, scaled to the period. */
export function buildFunnelTargetProgress(
  counts: FunnelCounts,
  period: ReportingPeriod,
  monthlyTarget: number | null,
): FunnelTargetProgress {
  const achieved = counts.authorizedListings;
  if (monthlyTarget === null || monthlyTarget <= 0) return { monthlyTarget: null, periodTarget: null, achieved, ratio: null };
  const periodTarget = monthlyTarget * targetMonths[period];
  return { monthlyTarget, periodTarget, achieved, ratio: achieved / periodTarget };
}

const named = (subject: FunnelCoachingSubject | null, fallback: string): string =>
  subject ? `${subject.name} (${subject.detail}) ile` : fallback;

export function buildFunnelCoaching(counts: FunnelCounts, subjects: FunnelSubjects = emptyFunnelSubjects): FunnelCoaching {
  if (counts.newPeople < 5 && counts.leads === 0) {
    return { title: "Önce birkaç gerçek kayıt topla", explanation: "Sağlıklı bir yönlendirme için en az beş yeni kişi veya görüşme kaydı gerekli.", script: "Bugün tanıştığın kişileri tek cümleyle Akış'a kaydet.", target: "capture", subject: null };
  }
  if (counts.newPeople > 0 && counts.leads === 0) {
    const subject = subjects.newestUncontactedContact;
    return { title: "Tanışmayı gayrimenkul konuşmasına çevir", explanation: `${counts.newPeople} yeni kişi var; henüz talep oluşmamış. ${named(subject, "En yeni kişiyle")} başla ve ihtiyacını sor.`, script: "Çevrenizde evini satmayı düşünen veya yeni bir yer arayan biri var mı?", target: "contacts", subject };
  }
  if (counts.leads > 0 && counts.appointments === 0) {
    const subject = subjects.oldestOpportunityWithoutAppointment;
    const introduced = subject?.introduced === true;
    const requirement = subject?.opportunityType === "buyer_requirement" || subject?.opportunityType === "tenant_requirement";
    return introduced
      ? { title: "Talebi randevuya taşı", explanation: `${counts.leads} talep var; randevu yok. ${named(subject, "En eski talep için")} tanıştırma iznini netleştir.`, script: "Beni kendisiyle tanıştırabilir misin? Kısa bir görüşme yapmam ikimiz için de çok faydalı olur.", target: "opportunities", subject }
      : { title: requirement ? "İhtiyaç görüşmesini planla" : "Portföy görüşmesini planla", explanation: `${counts.leads} talep var; randevu yok. ${named(subject, "En eski talep için")} doğrudan görüşme zamanını belirle.`, script: requirement ? "İhtiyacınızı netleştirmek için ne zaman 15 dakikalık bir görüşme yapabiliriz?" : "Mülkünüzü ve doğru pazarlama planını konuşmak için ne zaman görüşebiliriz?", target: "opportunities", subject };
  }
  if (counts.appointments > 0 && counts.authorizedListings === 0) {
    const subject = subjects.oldestAppointmentWithoutMandate;
    return { title: "Randevuda değer ve yetkiyi netleştir", explanation: `${counts.appointments} randevuya rağmen yetkili portföy oluşmamış. ${named(subject, "Randevu aşamasındaki kayıt için")} değerleme ve çalışma biçimini açıkça konuş.`, script: "Doğru fiyat ve pazarlama planını birlikte netleştirelim; yetkiyle çalışırsak süreci tek elden yönetebilirim.", target: "opportunities", subject };
  }
  if (counts.authorizedListings > 0 && subjects.oldestUnreadyListing) {
    const subject = subjects.oldestUnreadyListing;
    return { title: "Portföyü pazara hazırla", explanation: `${named(subject, "Yetkili portföy için")} eksik fiyat veya hazırlık bilgisini tamamla. Hazır olmayan portföy eşleşmeye ve sunuma taşınamaz.`, script: "Değerleme sonucunu netleştirip liste fiyatını bugün kaydedelim.", target: "listings", subject };
  }
  if (counts.authorizedListings > 0 && counts.closings === 0) {
    const subject = subjects.oldestActiveListing;
    return { title: "Portföyü görüşmeye ve teklife taşı", explanation: `${counts.authorizedListings} yetkili portföy var; kapanış yok. ${named(subject, "En eski portföy için")} eşleşmeleri, sunumları ve teklif takibini sırala.`, script: "Bu portföy için en uygun üç kişiyi bugün arayıp gösterim zamanını netleştirelim.", target: "listings", subject };
  }
  return { title: "Akış çalışıyor; ritmi koru", explanation: `${counts.closings} kapanışa ulaştın. Yeni kişi ve takip kayıtlarını aksatmadan aynı döngüyü sürdür.`, script: "Bugünün beşini tamamla, sonra yeni fırsatları Akış'a ekle.", target: "capture", subject: null };
}
