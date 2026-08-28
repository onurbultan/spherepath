import { ScrollView, StyleSheet, View } from "react-native";
import { CalendarCheck, Target } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { SpCard } from "@/shared/ui/SpCard";
import { SpText } from "@/shared/ui/SpText";
import { radius, space } from "@/shared/ui/tokens.generated";
import { useSpTheme } from "@/shared/ui/theme";

const stages = ["Tanışma", "İlişki", "Lead", "Portföy", "Kapama"] as const;

export default function TodayView() {
  const theme = useSpTheme();
  return (
    <SafeAreaView edges={["top", "left", "right"]} style={[styles.safe, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <SpText variant="eyebrow" color="deed">BUGÜN</SpText>
          <SpText variant="hero">Bugünün odağı</SpText>
          <SpText color="secondary">Henüz ölçüm oluşturacak temas yok. İlk görüşmeni kaydettiğinde Spherepath odağını açıklayacak.</SpText>
        </View>

        <View style={styles.sectionHeading}>
          <View><SpText variant="eyebrow">SATIŞ SİSTEMİ</SpText><SpText variant="title">Beş aşamalı sağlık</SpText></View>
          <View style={[styles.period, { backgroundColor: theme.deedBg }]}><SpText variant="eyebrow" color="deed">30 GÜN</SpText></View>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.stageRow}>
          {stages.map((stage) => (
            <SpCard key={stage} style={styles.stageCard}>
              <SpText variant="eyebrow" color="deed">{stage}</SpText>
              <SpText variant="figure">0</SpText>
              <SpText variant="bodySmall" color="secondary">Henüz veri yok</SpText>
            </SpCard>
          ))}
        </ScrollView>

        <SpCard style={styles.detailCard}>
          <View style={[styles.icon, { backgroundColor: theme.askBg }]}><Target color={theme.ask} size={19} /></View>
          <SpText variant="eyebrow" color="ask">DARBOĞAZ</SpText>
          <SpText variant="title">Başlamak için veri gerekiyor</SpText>
          <SpText color="secondary">Birkaç gerçek temas kaydından sonra dönem, payda ve aşama süresine göre tek bir odak göstereceğiz.</SpText>
        </SpCard>

        <SpCard style={styles.detailCard}>
          <View style={[styles.icon, { backgroundColor: theme.deedBg }]}><CalendarCheck color={theme.deed} size={19} /></View>
          <SpText variant="eyebrow" color="deed">GÜNLÜK PLAN</SpText>
          <SpText variant="title">Bugün için görev yok</SpText>
          <SpText color="secondary">Sonraki adımı olan kişi ve fırsatlar burada en fazla beş eylem olarak sıralanacak.</SpText>
        </SpCard>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: space.xl, paddingBottom: space["5xl"], gap: space.xl },
  header: { gap: space.md, marginTop: space.xl, marginBottom: space.xl },
  sectionHeading: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: space.md },
  period: { paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.sm },
  stageRow: { gap: space.md, paddingRight: space.xl },
  stageCard: { width: 142, minHeight: 132, gap: space.md },
  detailCard: { gap: space.md, minHeight: 220 },
  icon: { width: 40, height: 40, borderRadius: radius.md, alignItems: "center", justifyContent: "center", marginBottom: space.md },
});
