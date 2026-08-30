import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { ArrowRight, Target, TrendingDown } from "lucide-react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { apiQueryKeys, reportingPeriodLabels, reportingPeriods, type CurrencyCode, type ReportingPeriod } from "@spherepath/shared";
import { SafeAreaView } from "react-native-safe-area-context";
import { loadFunnelOverview } from "../resources/funnel";
import { SpCard } from "@/shared/ui/SpCard";
import { SpText } from "@/shared/ui/SpText";
import { radius, space } from "@/shared/ui/tokens.generated";
import { useSpTheme } from "@/shared/ui/theme";

const messageFrom = (error: unknown) => error instanceof Error ? error.message : "Huni yüklenemedi.";
const money = (amount: number, currency: CurrencyCode) => new Intl.NumberFormat("tr-TR", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);

export default function FunnelView() {
  const theme = useSpTheme(); const [period, setPeriod] = useState<ReportingPeriod>("30d");
  const query = useQuery({ queryKey: apiQueryKeys.funnelOverview(period), queryFn: () => loadFunnelOverview(period) });
  const routes = { capture: "/(tabs)/capture", contacts: "/(tabs)/contacts", opportunities: "/(tabs)/opportunities", listings: "/(tabs)/listings" } as const;
  const counts = query.data?.counts; const earnings = query.data?.earnings; const target = query.data?.target; const metrics = query.data?.metrics;
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
      <SpCard style={styles.earnings}><View style={styles.earningsHead}><View style={{ flex: 1 }}><SpText variant="eyebrow" color="deed">{reportingPeriodLabels[period].toLocaleUpperCase("tr-TR")} İÇİNDE</SpText><SpText variant="title">Kazancın</SpText></View>{target?.periodTarget ? <View style={[styles.targetChip, { borderColor: theme.line, backgroundColor: theme.background }]}><SpText variant="caption" color="secondary">Portföy hedefi</SpText><SpText variant="bodySmall">{target.achieved} / {target.periodTarget}</SpText></View> : null}</View>
      {earnings?.totals.length ? earnings.totals.map((total) => <View key={total.currency} style={styles.earningsTotal}><SpText variant="figure" style={{ color: theme.good }}>{money(total.commission, total.currency)}</SpText><SpText variant="caption" color="secondary">{total.closedCount} kapanan işlem · {money(total.volume, total.currency)} hacim{total.commissionRate !== null ? ` · %${(total.commissionRate * 100).toFixed(1)} komisyon` : ""}</SpText></View>) : <SpText color="secondary">Bu dönemde kapanan işlem yok. Bir işlemi kapattığında komisyonun burada toplanır.</SpText>}
      {target?.periodTarget ? <View style={[styles.bar, { backgroundColor: theme.sunk }]}><View style={{ width: `${Math.min(100, Math.round((target.ratio ?? 0) * 100))}%`, height: "100%", borderRadius: 999, backgroundColor: theme.deed }} /></View> : null}
      {earnings && earnings.incompleteCount > 0 ? <SpText variant="caption" color="ask">{earnings.incompleteCount} kapanan işlemde tutar veya para birimi eksik; toplamlara katılmadı.</SpText> : null}</SpCard>
      <SpCard style={styles.funnel}>{stages.map((stage, index) => { const active = index === bottleneckIndex; return <View key={stage.label} style={[styles.stage, { borderColor: active ? theme.warm : theme.line, backgroundColor: active ? theme.warmBg : theme.card }]}><View style={[styles.step, { backgroundColor: active ? theme.warm : theme.background }]}><SpText variant="caption" style={{ color: active ? theme.background : theme.textSecondary }}>{index + 1}</SpText></View><View style={styles.stageCopy}><SpText variant="bodySmall">{stage.label}</SpText><SpText variant="caption" color="secondary">{stage.detail}</SpText></View><SpText variant="figure" style={{ color: stage.color }}>{stage.value}</SpText>{active ? <View style={[styles.bottleneck, { backgroundColor: theme.warm }]}><TrendingDown size={13} color={theme.background} /><SpText variant="caption" style={{ color: theme.background }}>Burada duruyor</SpText></View> : null}</View>; })}</SpCard>
      <SpCard style={styles.earnings}><SpText variant="eyebrow" color="deed">KENDİ AYNAN</SpText><SpText variant="title">Rakamların sana ne diyor</SpText>
      {!metrics ? null : !metrics.sampleSufficient ? <SpText color="secondary">Henüz güvenilir bir sonuç çıkaracak kadar kayıt yok. Birkaç görüşme daha kaydettiğinde buradaki oranlar anlamlı olmaya başlar.</SpText> : <View style={styles.mirrorTiles}>
        {metrics.keptPromiseRate ? <View style={[styles.mirrorTile, { borderColor: theme.line, backgroundColor: theme.background }]}><SpText variant="figure" style={{ color: theme.deed }}>%{Math.round(metrics.keptPromiseRate.rate * 100)}</SpText><SpText variant="caption" color="secondary">Tuttuğun söz · {metrics.keptPromiseRate.kept}/{metrics.keptPromiseRate.promised}</SpText></View> : null}
        {metrics.timeToWonDays !== null ? <View style={[styles.mirrorTile, { borderColor: theme.line, backgroundColor: theme.background }]}><SpText variant="figure" style={{ color: theme.deed }}>{metrics.timeToWonDays}</SpText><SpText variant="caption" color="secondary">Kazanmaya kadar gün</SpText></View> : null}
        {metrics.stageDurations[0] ? <View style={[styles.mirrorTile, { borderColor: theme.line, backgroundColor: theme.background }]}><SpText variant="figure" style={{ color: theme.warm }}>{metrics.stageDurations[0].medianDays}</SpText><SpText variant="caption" color="secondary">En yavaş aşama: {metrics.stageDurations[0].stage}</SpText></View> : null}
        {metrics.askByObjective[0] ? <View style={[styles.mirrorTile, { borderColor: theme.line, backgroundColor: theme.background }]}><SpText variant="figure" style={{ color: theme.good }}>%{Math.round(metrics.askByObjective[0].rate * 100)}</SpText><SpText variant="caption" color="secondary">En çok tutan talep: {metrics.askByObjective[0].label}</SpText></View> : null}
      </View>}</SpCard>
      <SpCard style={styles.coaching}><View style={[styles.target, { backgroundColor: theme.askBg }]}><Target size={21} color={theme.ask} /></View><SpText variant="eyebrow" color="ask">ŞİMDİKİ DARBOĞAZ</SpText><SpText variant="title">{query.data?.coaching.title}</SpText><SpText color="secondary">{query.data?.coaching.explanation}</SpText><View style={[styles.script, { backgroundColor: theme.background, borderColor: theme.line }]}><SpText variant="bodySmall" color="secondary">Söyleyebileceğin cümle</SpText><SpText>“{query.data?.coaching.script}”</SpText></View><Pressable onPress={() => query.data && router.push(routes[query.data.coaching.target])} style={[styles.primary, { backgroundColor: theme.deed }]}><SpText style={{ color: theme.onDeed }}>İlgili kayıtları aç</SpText><ArrowRight size={19} color={theme.onDeed} /></Pressable></SpCard>
    </>}
  </ScrollView></SafeAreaView>;
}

const styles = StyleSheet.create({ safe: { flex: 1 }, content: { padding: space.lg, paddingBottom: 120, gap: space.xl }, header: { gap: space.xs }, periods: { flexDirection: "row", gap: space.sm }, period: { minHeight: 42, flex: 1, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, alignItems: "center", justifyContent: "center" }, funnel: { gap: 0 }, stage: { position: "relative", minHeight: 68, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.sm, paddingVertical: space.md }, step: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" }, stageCopy: { flex: 1, gap: 2 }, bottleneck: { position: "absolute", right: space.sm, top: -10, borderRadius: 999, paddingHorizontal: space.sm, paddingVertical: 3, flexDirection: "row", alignItems: "center", gap: 4 }, earnings: { gap: space.md }, earningsHead: { flexDirection: "row", alignItems: "flex-start", gap: space.md }, targetChip: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, paddingHorizontal: space.lg, paddingVertical: space.sm, alignItems: "flex-end", gap: 2 }, earningsTotal: { gap: 2 }, mirrorTiles: { flexDirection: "row", flexWrap: "wrap", gap: space.md }, mirrorTile: { flexGrow: 1, flexBasis: "45%", borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, padding: space.lg, gap: 2 }, bar: { height: 6, borderRadius: 999, overflow: "hidden" }, coaching: { gap: space.md }, target: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" }, script: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, padding: space.lg, gap: space.xs }, primary: { minHeight: 50, borderRadius: radius.md, paddingHorizontal: space.lg, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.sm } });
