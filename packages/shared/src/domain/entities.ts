export type Instant = number;

export type Ulke = "TR" | "KKTC";
export type KullaniciRolu = "agent" | "broker";
export type ParaBirimi = "TRY" | "GBP" | "USD" | "EUR";
export type Kaynak =
  | "yuz_yuze"
  | "referans"
  | "ilan"
  | "sosyal"
  | "kapi"
  | "bolge"
  | "rehber"
  | "diger";
export type KisiRolu =
  | "alici"
  | "satici"
  | "kiraci"
  | "kiraya_veren"
  | "yatirimci"
  | "meslektas"
  | "bilgi_kaynagi"
  | "referans_kaynagi"
  | "belirsiz";
export type Kanal = "yuz_yuze" | "telefon" | "whatsapp" | "sms" | "eposta" | "diger";
export type TemasAmaci =
  | "tanima"
  | "deger_sunma"
  | "izin"
  | "randevu"
  | "referans_talebi"
  | "portfoy_talebi"
  | "takip"
  | "sunum"
  | "teklif";
export type TalepCevabi = "olumlu" | "belirsiz" | "olumsuz" | "sorulmadi" | "uygun_degil";
export type IliskiAsamasi = "yeni" | "taniniyor" | "etkilesimde" | "aktif" | "referans_kaynagi";
export type SonrakiAksiyonTipi =
  | "ara"
  | "mesaj"
  | "randevu"
  | "degerleme"
  | "teklif"
  | "izin_tamamla"
  | "talep_yap"
  | "diger";
export type FirsatTipi =
  | "satici_portfoy"
  | "kiraya_veren_portfoy"
  | "alici_ihtiyaci"
  | "kiraci_ihtiyaci";
export type FirsatAsamasi =
  | "yeni_lead"
  | "ilk_temas"
  | "randevu"
  | "degerleme"
  | "teklif_yetki"
  | "kazanildi"
  | "kayip";

export interface TenantOwned {
  officeId: string;
  ownerUid: string;
}

export interface Audited {
  createdAt: Instant;
  updatedAt: Instant;
}

export interface Office {
  name: string;
  country: Ulke;
  retentionPolicyVersion: string;
  createdAt: Instant;
}

export interface User extends Audited {
  officeId: string;
  role: KullaniciRolu;
  displayName: string;
  phone: string | null;
  defaultRegions: string[];
  monthlyPortfolioTarget: number | null;
  weeklyCapacity: number | null;
}

export interface Contact extends TenantOwned, Audited {
  phone: string | null;
  phoneHash: string | null;
  adSoyad: string | null;
  takmaEtiket: string | null;
  tanismaYeri: string | null;
  tanismaTarihi: Instant;
  kaynak: Kaynak;
  roller: KisiRolu[];
  relationship: {
    stage: IliskiAsamasi;
    meaningfulTouchCount: number;
    reciprocalTouchCount: number;
    lastTouchAt: Instant | null;
    nextActionAt: Instant | null;
    nextActionType: SonrakiAksiyonTipi | null;
    lastObjective: TemasAmaci | null;
    lastAskOutcome: TalepCevabi | null;
    referralCount: number;
  };
  kvkk: {
    noticeStatus: "bekliyor" | "tamamlandi";
    noticeAt: Instant | null;
    noticeMethod: "sozlu" | "yazili" | "elektronik" | null;
    noticeVersion: string | null;
    marketingConsent: "bilinmiyor" | "verildi" | "geri_alindi";
    marketingChannels: Array<"telefon" | "whatsapp" | "sms" | "eposta">;
    profilingObjection: boolean;
    deletionRequestedAt: Instant | null;
  };
  deletedAt: Instant | null;
}

export interface Interaction extends TenantOwned {
  contactId: string;
  channel: Kanal;
  occurredAt: Instant;
  objective: TemasAmaci;
  direction: "giden" | "gelen" | "karsilikli";
  outcome: string | null;
  askOutcome: TalepCevabi;
  nextActionAt: Instant | null;
  nextActionType: SonrakiAksiyonTipi | null;
  noteSummary: string | null;
  voiceNoteId: string | null;
  createdAt: Instant;
}

export interface Opportunity extends TenantOwned, Audited {
  type: FirsatTipi;
  subjectContactId: string;
  sourceContactId: string | null;
  referralId: string | null;
  propertyId: string | null;
  stage: FirsatAsamasi;
  qualifiedAt: Instant | null;
  stageEnteredAt: Instant;
  nextActionAt: Instant | null;
  lostReason: string | null;
  estimatedValue: { amount: number; currency: ParaBirimi } | null;
  closedAt: Instant | null;
  deletedAt: Instant | null;
}

export interface StageEvent extends TenantOwned {
  entityType: "contact" | "referral" | "opportunity" | "listing" | "deal";
  entityId: string;
  fromStage: string | null;
  toStage: string;
  reason: string | null;
  commandId: string;
  occurredAt: Instant;
  createdAt: Instant;
}

export interface DailyTask extends TenantOwned, Audited {
  type:
    | "yeni_kisi"
    | "anlamli_temas"
    | "deger_sun"
    | "izin_tamamla"
    | "talep_yap"
    | "leadi_ilerlet"
    | "portfoyu_ilerlet"
    | "teklifi_takip";
  relatedEntityType: "contact" | "referral" | "opportunity" | "listing" | "deal" | null;
  relatedEntityId: string | null;
  reason: string;
  evidence: {
    ruleId: string;
    ruleVersion: string;
    periodStart: Instant | null;
    periodEnd: Instant | null;
    metricId: string | null;
  };
  dueAt: Instant;
  estimatedMinutes: number | null;
  status: "bekliyor" | "tamamlandi" | "atlandi";
  completedAt: Instant | null;
  skippedReason: string | null;
}
