import { View } from "react-native";
import { advisorWorkflowCopy, type Deal } from "@spherepath/shared";
import { SpText } from "@/shared/ui/SpText";
import type { ListingRecord } from "@/features/listings/resources/listings";
export function DealHistory({ deal, listing }: { deal: Deal; listing?: ListingRecord }) {
  const money = (amount: number, currency: string) => new Intl.NumberFormat("tr-TR", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
  return <View>
    {listing ? <SpText color="secondary">Satıcı: {listing.ownerContactName} · Liste fiyatı: {listing.askingPrice === null ? "Belirlenmedi" : money(listing.askingPrice, listing.currency)}</SpText> : null}
    <SpText variant="title">{advisorWorkflowCopy.offerHistory}</SpText>
    {deal.offers?.length ? deal.offers.map((offer) => <View key={offer.id}><SpText>{offer.party === "seller" ? advisorWorkflowCopy.sellerOffer : advisorWorkflowCopy.buyerOffer}: {money(offer.amount, offer.currency)}</SpText><SpText variant="caption">{new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" }).format(offer.occurredAt)}</SpText><SpText color="secondary">{offer.note}</SpText></View>) : <SpText color="secondary">{advisorWorkflowCopy.noOffers}</SpText>}
    {deal.nextActionType === "appointment_confirmed" ? <SpText variant="caption">{advisorWorkflowCopy.confirmedAppointment}</SpText> : null}
    {deal.nextActionType === "appointment" ? <SpText variant="caption">{advisorWorkflowCopy.pendingAppointment}</SpText> : null}
  </View>;
}
