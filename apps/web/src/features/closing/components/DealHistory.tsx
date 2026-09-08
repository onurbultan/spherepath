"use client";
import { advisorWorkflowCopy, type Deal } from "@spherepath/shared";
import type { ListingRecord } from "@/features/listings/resources/listings";
export function DealHistory({ deal, listing }: { deal: Deal; listing?: ListingRecord }) {
  const money = (amount: number, currency: string) => new Intl.NumberFormat("tr-TR", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
  return <div className="form-stack deal-history">
    {listing ? <p>Satıcı: {listing.ownerContactName} · Liste fiyatı: {listing.askingPrice === null ? "Belirlenmedi" : money(listing.askingPrice, listing.currency)}</p> : null}
    <strong>{advisorWorkflowCopy.offerHistory}</strong>
    {deal.offers?.length ? <ol className="offer-timeline">{deal.offers.map((offer) => <li key={offer.id}><strong>{offer.party === "seller" ? advisorWorkflowCopy.sellerOffer : advisorWorkflowCopy.buyerOffer}: {money(offer.amount, offer.currency)}</strong><time>{new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" }).format(offer.occurredAt)}</time><p>{offer.note}</p></li>)}</ol> : <p>{advisorWorkflowCopy.noOffers}</p>}
    {deal.nextActionType === "appointment_confirmed" ? <small>{advisorWorkflowCopy.confirmedAppointment}</small> : null}
    {deal.nextActionType === "appointment" ? <small>{advisorWorkflowCopy.pendingAppointment}</small> : null}
  </div>;
}
