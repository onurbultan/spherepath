import type { FirsatAsamasi } from "../domain/entities.js";

const allowedTransitions: Readonly<Record<FirsatAsamasi, readonly FirsatAsamasi[]>> = {
  yeni_lead: ["ilk_temas", "kayip"],
  ilk_temas: ["randevu", "kayip"],
  randevu: ["degerleme", "kayip"],
  degerleme: ["teklif_yetki", "kayip"],
  teklif_yetki: ["kazanildi", "kayip"],
  kazanildi: [],
  kayip: ["ilk_temas"],
};

export function canTransitionOpportunity(
  from: FirsatAsamasi,
  to: FirsatAsamasi,
): boolean {
  return allowedTransitions[from].includes(to);
}

export function assertOpportunityTransition(
  from: FirsatAsamasi,
  to: FirsatAsamasi,
): void {
  if (!canTransitionOpportunity(from, to)) {
    throw new Error(`Invalid opportunity transition: ${from} -> ${to}`);
  }
}
