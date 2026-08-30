import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { ArrowRight, Target, TrendingDown } from "lucide-react-native";
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
  const counts = query.data?.counts;
  const stages = counts ? [
    { label: "Yeni insanlar", detail: "Tanıştığın kişiler", value: counts.newPeople, color: theme.deed },
    { label: "Talepler", detail: "Gayrimenkul ihtiyacı", value: counts.leads, color: theme.good },
    { label: "Randevular", detail: `${counts.portfolioMeetings} portföy görüşmesi`, value: counts.appointments, color: theme.warm },
    { label: "Yetkili portföy", detail: `${counts.negotiations} pazarlıkta`, value: counts.authorizedListings, color: theme.ask },
    { label: "Kapanışlar", detail: "Tamamlanan işlemler", value: counts.closings, color: theme.good },
  ] : [];
  const bottleneckIndex = counts
    ? counts.newPeople < 5 && counts.leads === 0 ? 0
      : counts.newPeople > 0 && counts.leads === 0 ? 1
        : counts.leads > 0 && counts.appointments === 0 ? 2
          : counts.appointments > 0 && counts.authorizedListings === 0 ? 3
            : counts.authorizedListings > 0 && counts.closings === 0 ? 4
              : null
    : null;
  return <SafeAreaView edges={["top", "left", "right"]} style={[styles.safe, { backgroundColor: theme.background }]}><ScrollView contentContainerStyle={styles.content}>
    <View style={styles.header}><SpText variant="eyebrow" color="deed">SATIŞ HUNİSİ</SpText><SpText variant="hero">Nerede takılıyor?</SpText><SpText color="secondary">Rakamı gör, doğru cümleyi al ve bir sonraki adımı aç.</SpText></View>
    <View accessibilityRole="radiogroup" style={styles.periods}>{reportingPeriods.map((item) => <Pressable key={item} accessibilityRole="radio" accessibilityState={{ checked: period === item }} onPress={() => setPeriod(item)} style={[styles.period, { borderColor: period === item ? theme.deed : theme.line, backgroundColor: period === item ? theme.deedBg : theme.card }]}><SpText variant="bodySmall" color={period === item ? "deed" : "secondary"}>{reportingPeriodLabels[item]}</SpText></Pressable>)}</View>
    {query.isPending ? <ActivityIndicator color={theme.deed} /> : query.error ? <SpCard><SpText color="ask">{messageFrom(query.error)}</SpText></SpCard> : <>
      <SpCard style={styles.funnel}>{stages.map((stage, index) => { const active = index === bottleneckIndex; return <View key={stage.label} style={[styles.stage, { borderColor: active ? theme.warm : theme.line, backgroundColor: active ? theme.warmBg : theme.card }]}><View style={[styles.step, { backgroundColor: active ? theme.warm : theme.background }]}><SpText variant="caption" style={{ color: active ? theme.background : theme.textSecondary }}>{index + 1}</SpText></View><View style={styles.stageCopy}><SpText variant="bodySmall">{stage.label}</SpText><SpText variant="caption" color="secondary">{stage.detail}</SpText></View><SpText variant="figure" style={{ color: stage.color }}>{stage.value}</SpText>{active ? <View style={[styles.bottleneck, { backgroundColor: theme.warm }]}><TrendingDown size={13} color={theme.background} /><SpText variant="caption" style={{ color: theme.background }}>Burada duruyor</SpText></View> : null}</View>; })}</SpCard>
      <SpCard style={styles.coaching}><View style={[styles.target, { backgroundColor: theme.askBg }]}><Target size={21} color={theme.ask} /></View><SpText variant="eyebrow" color="ask">ŞİMDİKİ DARBOĞAZ</SpText><SpText variant="title">{query.data?.coaching.title}</SpText><SpText color="secondary">{query.data?.coaching.explanation}</SpText><View style={[styles.script, { backgroundColor: theme.background, borderColor: theme.line }]}><SpText variant="bodySmall" color="secondary">Söyleyebileceğin cümle</SpText><SpText>“{query.data?.coaching.script}”</SpText></View><Pressable onPress={() => query.data && router.push(routes[query.data.coaching.target])} style={[styles.primary, { backgroundColor: theme.deed }]}><SpText style={{ color: theme.onDeed }}>İlgili kayıtları aç</SpText><ArrowRight size={19} color={theme.onDeed} /></Pressable></SpCard>
    </>}
  </ScrollView></SafeAreaView>;
}

const styles = StyleSheet.create({ safe: { flex: 1 }, content: { padding: space.lg, paddingBottom: 120, gap: space.xl }, header: { gap: space.xs }, periods: { flexDirection: "row", gap: space.sm }, period: { minHeight: 42, flex: 1, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, alignItems: "center", justifyContent: "center" }, funnel: { gap: 0 }, stage: { position: "relative", minHeight: 68, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.sm, paddingVertical: space.md }, step: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" }, stageCopy: { flex: 1, gap: 2 }, bottleneck: { position: "absolute", right: space.sm, top: -10, borderRadius: 999, paddingHorizontal: space.sm, paddingVertical: 3, flexDirection: "row", alignItems: "center", gap: 4 }, coaching: { gap: space.md }, target: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" }, script: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, padding: space.lg, gap: space.xs }, primary: { minHeight: 50, borderRadius: radius.md, paddingHorizontal: space.lg, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.sm } });
