import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { useIncomingShare } from "expo-sharing";
import { Check, MessageSquareShare, X } from "lucide-react-native";
import { SpCard } from "@/shared/ui/SpCard";
import { SpText } from "@/shared/ui/SpText";
import { radius, space } from "@/shared/ui/tokens.generated";
import { useSpTheme } from "@/shared/ui/theme";

export default function ShareReceivedRoute() {
  const theme = useSpTheme();
  const { sharedPayloads, isResolving, error, clearSharedPayloads } = useIncomingShare();
  const text = sharedPayloads
    .filter((payload) => payload.shareType === "text" || payload.shareType === "url")
    .map((payload) => payload.value?.trim() ?? "")
    .filter(Boolean)
    .join("\n")
    .slice(0, 4_000);

  function close() {
    clearSharedPayloads();
    router.replace("/(tabs)");
  }

  function review() {
    if (!text) return;
    clearSharedPayloads();
    router.replace({ pathname: "/(tabs)", params: { sharedText: text } });
  }

  return <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
    <ScrollView contentContainerStyle={styles.content}>
      <View style={[styles.icon, { backgroundColor: theme.deedBg }]}><MessageSquareShare size={28} color={theme.deed} /></View>
      <View style={styles.heading}><SpText variant="eyebrow" color="deed">PAYLAŞILAN NOT</SpText><SpText variant="hero">Akış&apos;a aktar</SpText><SpText color="secondary">Mesaj önce düzenlenebilir alana gelecek. Sen onaylamadan hiçbir kayıt oluşturulmaz.</SpText></View>
      {isResolving ? <ActivityIndicator color={theme.deed} /> : error ? <SpCard><SpText color="ask">Paylaşılan içerik okunamadı. WhatsApp&apos;tan metni kopyalayıp Akış&apos;a yapıştırabilirsin.</SpText></SpCard> : text ? <SpCard style={styles.preview}><SpText variant="eyebrow" color="deed">ÖN İZLEME</SpText><SpText>{text}</SpText></SpCard> : <SpCard><SpText color="secondary">Bu paylaşımda aktarılabilecek bir metin bulunamadı.</SpText></SpCard>}
      <View style={styles.actions}><Pressable accessibilityRole="button" onPress={close} style={[styles.secondary, { borderColor: theme.line }]}><X size={18} color={theme.textSecondary} /><SpText color="secondary">Vazgeç</SpText></Pressable><Pressable accessibilityRole="button" disabled={!text || isResolving} onPress={review} style={[styles.primary, { backgroundColor: theme.deed, opacity: !text || isResolving ? .45 : 1 }]}><Check size={18} color={theme.onDeed} /><SpText style={{ color: theme.onDeed }}>Akış&apos;ta kontrol et</SpText></Pressable></View>
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { flexGrow: 1, justifyContent: "center", gap: space.xl, padding: space["2xl"] },
  icon: { width: 58, height: 58, alignItems: "center", justifyContent: "center", borderRadius: radius.lg },
  heading: { gap: space.sm },
  preview: { gap: space.md },
  actions: { flexDirection: "row", gap: space.sm },
  secondary: { minHeight: 48, flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.sm, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md },
  primary: { minHeight: 48, flex: 1.4, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.sm, borderRadius: radius.md },
});
