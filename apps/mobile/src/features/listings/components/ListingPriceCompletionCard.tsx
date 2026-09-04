import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import {
  apiQueryKeys,
  currencyCodes,
  listingPriceUpdateSchema,
  parseMoneyInput,
  type CurrencyCode,
} from "@spherepath/shared";
import { useSession } from "@/features/auth/resources/session";
import { MoneyInput } from "@/shared/ui/MaskedInputs";
import { SpCard } from "@/shared/ui/SpCard";
import { choiceMetrics, controlMetrics, largeButtonMetrics } from "@/shared/ui/SpField";
import { SpText } from "@/shared/ui/SpText";
import { radius, space } from "@/shared/ui/tokens.generated";
import { useSpTheme } from "@/shared/ui/theme";
import { updateListingPrice, type ListingRecord } from "../resources/listings";

const messageFrom = (error: unknown) => error instanceof Error ? error.message : "Fiyat kaydedilemedi.";

export function ListingPriceCompletionCard({ listing }: { listing: ListingRecord }) {
  const theme = useSpTheme();
  const { session } = useSession();
  const queryClient = useQueryClient();
  const [value, setValue] = useState("");
  const [currency, setCurrency] = useState<CurrencyCode>(listing.currency);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputStyle = [styles.input, { color: theme.textPrimary, backgroundColor: theme.background, borderColor: theme.line }];

  async function save() {
    if (!session) return;
    const parsed = listingPriceUpdateSchema.safeParse({ listingId: listing.id, askingPrice: parseMoneyInput(value), currency });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Geçerli bir fiyat gir.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      await updateListingPrice(session, parsed.data);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: apiQueryKeys.listings }),
        queryClient.invalidateQueries({ queryKey: apiQueryKeys.todayOverview }),
      ]);
    } catch (nextError) {
      setError(messageFrom(nextError));
    } finally {
      setPending(false);
    }
  }

  return <SpCard style={styles.card}>
    <SpText variant="eyebrow" color="deed">DEĞERLEME SONUCU</SpText>
    <SpText variant="title">{listing.propertySummary.address} için fiyat bekleniyor</SpText>
    <SpText color="secondary">Doğrulanmış liste fiyatını gir; günlük plandaki eksik portföy işi otomatik kapansın.</SpText>
    <MoneyInput accessibilityLabel="Liste fiyatı" currency={currency} style={inputStyle} value={value} onChangeText={setValue} />
    <View accessibilityLabel="Para birimi" accessibilityRole="radiogroup" style={styles.choices}>
      {currencyCodes.map((item) => <Pressable accessibilityRole="radio" accessibilityState={{ checked: currency === item }} key={item} onPress={() => setCurrency(item)} style={[styles.choice, { backgroundColor: currency === item ? theme.deedBg : theme.background, borderColor: currency === item ? theme.deed : theme.line }]}><SpText variant="bodySmall" color={currency === item ? "deed" : "secondary"}>{item}</SpText></Pressable>)}
    </View>
    {error ? <View style={[styles.error, { backgroundColor: theme.askBg }]}><SpText color="ask">{error}</SpText></View> : null}
    <Pressable disabled={pending} onPress={() => void save()} style={[styles.primary, { backgroundColor: theme.ask, opacity: pending ? .5 : 1 }]}><SpText style={{ color: theme.onAsk }}>{pending ? "Kaydediliyor…" : "Fiyatı kaydet"}</SpText></Pressable>
  </SpCard>;
}

const styles = StyleSheet.create({
  card: { gap: space.md },
  input: { ...controlMetrics },
  choices: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  choice: { ...choiceMetrics },
  error: { padding: space.md, borderRadius: radius.md },
  primary: { ...largeButtonMetrics },
});
