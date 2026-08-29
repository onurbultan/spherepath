import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { ArrowRight, Target } from "lucide-react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { apiQueryKeys, reportingPeriodLabels, reportingPeriods, type ReportingPeriod } from "@spherepath/shared";
import { SafeAreaView } from "react-native-safe-area-context";
import { loadFunnelOverview } from "../resources/funnel";
import { SpCard } from "@/shared/ui/SpCard";
import { SpText } from "@/shared/ui/SpText";
import { radius, space } from "@/shared/ui/tokens.generated";
import { useSpTheme } from "@/shared/ui/theme";

const messageFrom = (error: unknown) => error instanceof Error ? error.message : "Huni yüklenemedi.";

export default function FunnelView() {
  const theme = useSpTheme(); const [period, setPeriod] = useState<ReportingPeriod>("30d");
  const query = useQuery({ queryKey: apiQueryKeys.funnelOverview(period), queryFn: () => loadFunnelOverview(period) });
  const routes = { capture: "/(tabs)/capture", contacts: "/(tabs)/contacts", opportunities: "/(tabs)/opportunities", listings: "/(tabs)/listings" } as const;
  const stages = query.data ? [
    { label: "Yeni insanla tanıştın", value: query.data.counts.newPeople, color: theme.deed, bg: theme.deedBg, width: "100%" as const },
    { label: "Talep aldın", value: query.data.counts.leads, color: theme.good, bg: theme.goodBg, width: "91%" as const },
    { label: `${query.data.counts.portfolioMeetings} portföy görüşmesi`, prefix: `${query.data.counts.appointments} randevu`, value: null, color: theme.warm, bg: theme.warmBg, width: "82%" as const },
    { label: `${query.data.counts.negotiations} pazarlıkta`, prefix: `${query.data.counts.authorizedListings} yetkili portföy`, value: null, color: theme.ask, bg: theme.askBg, width: "73%" as const },
    { label: "Kapanış", value: query.data.counts.closings, color: theme.good, bg: theme.goodBg, width: "62%" as const },
  ] : [];
  return <SafeAreaView edges={["top", "left", "right"]} style={[styles.safe, { backgroundColor: theme.background }]}><ScrollView contentContainerStyle={styles.content}>
    <View style={styles.header}><SpText variant="eyebrow" color="deed">SATIŞ HUNİSİ</SpText><SpText variant="hero">Nerede takılıyor?</SpText><SpText color="secondary">Rakamı gör, doğru cümleyi al ve bir sonraki adımı aç.</SpText></View>
    <View accessibilityRole="radiogroup" style={styles.periods}>{reportingPeriods.map((item) => <Pressable key={item} accessibilityRole="radio" accessibilityState={{ checked: period === item }} onPress={() => setPeriod(item)} style={[styles.period, { borderColor: period === item ? theme.deed : theme.line, backgroundColor: period === item ? theme.deedBg : theme.card }]}><SpText variant="bodySmall" color={period === item ? "deed" : "secondary"}>{reportingPeriodLabels[item]}</SpText></Pressable>)}</View>
    {query.isPending ? <ActivityIndicator color={theme.deed} /> : query.error ? <SpCard><SpText color="ask">{messageFrom(query.error)}</SpText></SpCard> : <>
      <View accessibilityLabel="Satış hunisi" style={styles.funnel}>{stages.map((stage) => <View key={stage.label} style={[styles.stage, { width: stage.width, backgroundColor: stage.bg, borderColor: stage.color }]}><SpText variant="figure" style={{ color: stage.color }}>{stage.value ?? stage.prefix}</SpText><SpText style={{ color: stage.color }}>{stage.label}</SpText></View>)}</View>
      <SpCard style={styles.coaching}><View style={[styles.target, { backgroundColor: theme.askBg }]}><Target size={21} color={theme.ask} /></View><SpText variant="eyebrow" color="ask">ŞİMDİKİ DARBOĞAZ</SpText><SpText variant="title">{query.data?.coaching.title}</SpText><SpText color="secondary">{query.data?.coaching.explanation}</SpText><View style={[styles.script, { backgroundColor: theme.background, borderColor: theme.line }]}><SpText variant="bodySmall" color="secondary">Söyleyebileceğin cümle</SpText><SpText>“{query.data?.coaching.script}”</SpText></View><Pressable onPress={() => query.data && router.push(routes[query.data.coaching.target])} style={[styles.primary, { backgroundColor: theme.deed }]}><SpText style={{ color: theme.onDeed }}>İlgili kayıtları aç</SpText><ArrowRight size={19} color={theme.onDeed} /></Pressable></SpCard>
    </>}
  </ScrollView></SafeAreaView>;
}

const styles = StyleSheet.create({ safe: { flex: 1 }, content: { padding: space.lg, paddingBottom: 120, gap: space.xl }, header: { gap: space.xs }, periods: { flexDirection: "row", gap: space.sm }, period: { minHeight: 42, flex: 1, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, alignItems: "center", justifyContent: "center" }, funnel: { alignItems: "center", gap: space.md, paddingVertical: space.md }, stage: { minHeight: 82, borderWidth: 1, borderRadius: radius.lg, alignItems: "center", justifyContent: "center", padding: space.md }, coaching: { gap: space.md }, target: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" }, script: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, padding: space.lg, gap: space.xs }, primary: { minHeight: 50, borderRadius: radius.md, paddingHorizontal: space.lg, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.sm } });
