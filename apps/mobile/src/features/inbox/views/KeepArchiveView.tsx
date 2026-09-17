import { useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import { Check, FolderOpen } from "lucide-react-native";
import {
  apiQueryKeys,
  keepImportBatches,
  keepImportSummary,
  keepSkipLabels,
  planKeepImport,
  type KeepImportPlan,
} from "@spherepath/shared";
import { useSession } from "@/features/auth/resources/session";
import { SpButton } from "@/shared/ui/SpField";
import { SpCard } from "@/shared/ui/SpCard";
import { SpText } from "@/shared/ui/SpText";
import { useSpTheme } from "@/shared/ui/theme";
import { space } from "@/shared/ui/tokens.generated";
import { importKeepNotes } from "../resources/inbox";

const messageFrom = (error: unknown) => error instanceof Error ? error.message : "Arşiv aktarılamadı.";
const noteDate = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Istanbul" });

/**
 * An advisor who has kept five years of working memory in Google Keep is not
 * going to retype it. The archive is read on the phone and shown before
 * anything is written; importing a thousand notes is a decision, not a side
 * effect of choosing files.
 *
 * Nothing here is sent to the model. The notes arrive unread and are read one
 * at a time, when one is opened on the feed and asked for.
 */
export function KeepArchiveView() {
  const theme = useSpTheme();
  const { session } = useSession();
  const queryClient = useQueryClient();
  const [plan, setPlan] = useState<KeepImportPlan | null>(null);
  const [reading, setReading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [imported, setImported] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function pickFiles() {
    setReading(true); setError(null); setImported(null);
    const opened: File[] = [];
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ["application/json"], multiple: true, copyToCacheDirectory: true });
      if (result.canceled) return;
      const files = [];
      for (const asset of result.assets) {
        if (!asset.name.toLowerCase().endsWith(".json")) continue;
        const file = new File(asset.uri);
        opened.push(file);
        files.push({ name: asset.name, content: await file.text() });
      }
      if (!files.length) {
        setPlan(null);
        setError("Seçilenlerde Keep notu (.json) bulunamadı. Takeout arşivini açıp Keep klasöründeki dosyaları seçin.");
        return;
      }
      setPlan(planKeepImport(files));
    } catch (next) { setError(messageFrom(next)); }
    finally {
      for (const file of opened) if (file.exists) file.delete();
      setReading(false);
    }
  }

  function toggle(fileName: string) {
    setPlan((current) => current && {
      ...current,
      entries: current.entries.map((entry) => entry.fileName === fileName ? { ...entry, selected: !entry.selected } : entry),
    });
  }

  function toggleAll(selected: boolean) {
    setPlan((current) => current && { ...current, entries: current.entries.map((entry) => ({ ...entry, selected })) });
  }

  async function runImport() {
    if (!session || !plan) return;
    const batches = keepImportBatches(plan);
    if (!batches.length) { setError("Aktarılacak not seçilmedi."); return; }
    setProgress({ done: 0, total: batches.length }); setError(null);
    let total = 0;
    try {
      for (const [index, notes] of batches.entries()) {
        const result = await importKeepNotes(session, { notes });
        total += result.importedCount;
        setProgress({ done: index + 1, total: batches.length });
      }
      await queryClient.invalidateQueries({ queryKey: apiQueryKeys.inboxItems });
      setImported(total); setPlan(null);
    } catch (next) {
      // Batches already sent stay imported; saying so keeps a retry from
      // looking like it lost everything.
      setError(`${messageFrom(next)}${total ? ` ${total} not aktarıldı, kalanlar aktarılamadı.` : ""}`);
    } finally { setProgress(null); }
  }

  const selectedCount = plan?.entries.filter((entry) => entry.selected).length ?? 0;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <SpButton tone="secondary" label="← Notlar" onPress={() => router.replace("/(tabs)" as never)} />
        <SpText variant="eyebrow" color="secondary">KEEP ARŞİVİ</SpText>
        <SpText variant="hero">Eski notlarını getir</SpText>
        <SpText color="secondary">
          Google Takeout ile indirdiğin Keep arşivini seç. Notlar yazıldıkları tarihle birlikte gelir; hiçbiri
          otomatik okunmaz, istediğini açıp okutursun.
        </SpText>

        <SpCard style={styles.stack}>
          <SpText variant="bodySmall" color="secondary">1 · takeout.google.com adresinden yalnızca Keep&apos;i seçip arşivi indir.</SpText>
          <Pressable onPress={() => void Linking.openURL("https://takeout.google.com/")}>
            <SpText variant="bodySmall" color="deed">takeout.google.com&apos;u aç</SpText>
          </Pressable>
          <SpText variant="bodySmall" color="secondary">2 · İnen .zip dosyasını aç, içindeki Keep klasörüne gir.</SpText>
          <SpText variant="bodySmall" color="secondary">3 · Oradaki .json dosyalarını aşağıdan seç.</SpText>
          <SpButton
            disabled={reading || progress !== null}
            label={reading ? "Arşiv okunuyor…" : "Keep dosyalarını seç"}
            onPress={() => void pickFiles()}
          />
          {plan ? <SpText variant="caption" color="secondary">{keepImportSummary(plan)}</SpText> : null}
          {error ? <SpText accessibilityRole="alert" color="ask">{error}</SpText> : null}
          {imported !== null ? (
            <View style={styles.done}>
              <Check color={theme.deed} size={16} />
              <SpText variant="bodySmall" color="deed">{imported} not aktarıldı.</SpText>
            </View>
          ) : null}
        </SpCard>

        {plan?.entries.length ? (
          <SpCard style={styles.stack}>
            <SpText variant="eyebrow" color="secondary">AKTARILACAK NOTLAR</SpText>
            <SpText variant="title">{selectedCount} not seçili</SpText>
            <View style={styles.bulk}>
              <Pressable onPress={() => toggleAll(true)}><SpText variant="bodySmall" color="deed">Hepsini seç</SpText></Pressable>
              <Pressable onPress={() => toggleAll(false)}><SpText variant="bodySmall" color="deed">Hiçbirini seçme</SpText></Pressable>
            </View>
            {plan.entries.map((entry) => (
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: entry.selected }}
                key={entry.fileName}
                onPress={() => toggle(entry.fileName)}
                style={styles.entry}
              >
                <View style={[styles.box, { borderColor: entry.selected ? theme.deed : theme.line, backgroundColor: entry.selected ? theme.deed : "transparent" }]}>
                  {entry.selected ? <Check color={theme.onDeed} size={12} /> : null}
                </View>
                <View style={styles.entryText}>
                  <SpText variant="bodySmall">{entry.note.title || entry.text.split("\n")[0]}</SpText>
                  <SpText variant="caption" color="secondary">
                    {entry.note.createdAt ? noteDate.format(entry.note.createdAt) : "Tarihsiz"}
                    {entry.note.archived ? " · Keep'te arşivliydi" : ""}
                    {entry.note.labels.length ? ` · ${entry.note.labels.join(", ")}` : ""}
                  </SpText>
                </View>
              </Pressable>
            ))}
            <SpButton
              disabled={!selectedCount || progress !== null}
              label={progress ? `Aktarılıyor · ${progress.done}/${progress.total}` : `${selectedCount} notu aktar`}
              onPress={() => void runImport()}
            />
          </SpCard>
        ) : null}

        {plan?.skipped.length ? (
          <SpCard style={styles.stack}>
            <SpText variant="eyebrow" color="secondary">ATLANANLAR</SpText>
            <SpText variant="title">{plan.skipped.length} not aktarılmayacak</SpText>
            {plan.skipped.map((skip) => (
              <View key={skip.fileName} style={styles.entryText}>
                <SpText variant="bodySmall">{skip.title}</SpText>
                <SpText variant="caption" color="secondary">{keepSkipLabels[skip.reason]}</SpText>
              </View>
            ))}
          </SpCard>
        ) : null}

        <View style={styles.foot}>
          <FolderOpen color={theme.textSecondary} size={15} />
          <SpText variant="caption" color="secondary">Aktarılan notlar akışta &quot;Keep arşivi&quot; olarak görünür.</SpText>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { gap: space.md, padding: space.lg },
  stack: { gap: space.sm },
  bulk: { flexDirection: "row", gap: space.md },
  entry: { flexDirection: "row", alignItems: "flex-start", gap: space.sm, paddingVertical: space.xs },
  entryText: { flex: 1, gap: 2 },
  box: { width: 18, height: 18, borderRadius: 4, borderWidth: 1.5, alignItems: "center", justifyContent: "center", marginTop: 2 },
  done: { flexDirection: "row", alignItems: "center", gap: space.xs },
  foot: { flexDirection: "row", alignItems: "center", gap: space.xs },
});
