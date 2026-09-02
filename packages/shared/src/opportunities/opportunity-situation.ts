import type { ContactMemory, ContactPropertySituation, ContactRole, OpportunityType } from "../domain/entities.js";

/** A seller or landlord opportunity is about a property the contact already owns. */
export function isOwnerOpportunity(type: OpportunityType): boolean {
  return type === "seller_listing" || type === "landlord_listing";
}

/**
 * A contact who is selling one property while looking for another has both
 * situations in memory, and the opportunity decides which one is relevant.
 * Reading the collapsed search preference for every opportunity showed a
 * seller's listing card the criteria of the property they intend to buy --
 * indistinguishable, on screen, from the buying opportunity beside it.
 */
export function opportunitySituation(memory: ContactMemory, type: OpportunityType): ContactPropertySituation | null {
  const wanted = isOwnerOpportunity(type) ? "subject_property" : "search_preference";
  return memory.propertySituations.find((situation) => situation.propertyContext === wanted)
    // One situation and no match still beats showing the other side's criteria.
    ?? (memory.propertySituations.length === 1 ? null : null);
}

/**
 * What an opportunity says about the person it belongs to. A contact whose
 * seller opportunity is open is a seller, and leaving the role "unknown" makes
 * the contact list unable to filter for the very people being worked.
 */
export function opportunityImpliedRole(type: OpportunityType): ContactRole {
  switch (type) {
    case "seller_listing": return "seller";
    case "landlord_listing": return "landlord";
    case "buyer_requirement": return "buyer";
    case "tenant_requirement": return "tenant";
  }
}
