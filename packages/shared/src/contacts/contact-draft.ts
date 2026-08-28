import { z } from "zod";
import type { Contact, ContactRole, ContactSource, TenantOwned } from "../domain/entities.js";

export const contactSources = [
  "in_person",
  "referral",
  "listing",
  "social",
  "door",
  "area",
  "address_book",
  "other",
] as const satisfies readonly ContactSource[];

export const contactRoles = [
  "buyer",
  "seller",
  "tenant",
  "landlord",
  "investor",
  "peer",
  "information_source",
  "referral_source",
  "unknown",
] as const satisfies readonly ContactRole[];

export const contactSourceLabels: Record<ContactSource, string> = {
  in_person: "Yüz yüze",
  referral: "Referans",
  listing: "İlan",
  social: "Sosyal medya",
  door: "Kapı çalışması",
  area: "Bölge çalışması",
  address_book: "Rehber",
  other: "Diğer",
};

export const contactRoleLabels: Record<ContactRole, string> = {
  buyer: "Alıcı",
  seller: "Satıcı",
  tenant: "Kiracı",
  landlord: "Kiraya veren",
  investor: "Yatırımcı",
  peer: "Meslektaş",
  information_source: "Bilgi kaynağı",
  referral_source: "Referans kaynağı",
  unknown: "Henüz belirlenmedi",
};

export const contactDraftSchema = z.object({
  fullName: z.string().trim().min(2, "Ad veya tanımlayıcı en az 2 karakter olmalı.").max(120),
  phone: z.string().trim().max(30, "Telefon numarası en fazla 30 karakter olabilir."),
  metAtPlace: z.string().trim().max(160, "Tanışma yeri en fazla 160 karakter olabilir."),
  source: z.enum(contactSources),
  role: z.enum(contactRoles),
});

export type ContactDraft = z.infer<typeof contactDraftSchema>;

export function createContact(draft: ContactDraft, tenant: TenantOwned, now: number): Contact {
  const parsed = contactDraftSchema.parse(draft);

  return {
    ...tenant,
    phone: parsed.phone || null,
    phoneHash: null,
    fullName: parsed.fullName,
    label: null,
    metAtPlace: parsed.metAtPlace || null,
    metAt: now,
    source: parsed.source,
    roles: [parsed.role],
    relationship: {
      stage: "new",
      meaningfulTouchCount: 0,
      reciprocalTouchCount: 0,
      lastTouchAt: null,
      nextActionAt: null,
      nextActionType: null,
      lastObjective: null,
      lastAskOutcome: null,
      referralCount: 0,
    },
    privacy: {
      noticeStatus: "pending",
      noticeAt: null,
      noticeMethod: null,
      noticeVersion: null,
      marketingConsent: "unknown",
      marketingChannels: [],
      profilingObjection: false,
      deletionRequestedAt: null,
    },
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}
