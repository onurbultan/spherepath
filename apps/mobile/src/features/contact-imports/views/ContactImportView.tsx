import { useState } from "react";
import { Linking, ScrollView, StyleSheet, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import { contactImportCopy as copy, contactImportLimits } from "@spherepath/shared";
import { SpButton, SpField } from "@/shared/ui/SpField";
import { SpCard } from "@/shared/ui/SpCard";
import { SpText } from "@/shared/ui/SpText";
import { useSpTheme } from "@/shared/ui/theme";
import { space } from "@/shared/ui/tokens.generated";
import { ImportPreviewRow } from "../components/ImportPreviewRow";
import { useContactImport, importError } from "../viewModels/useContactImport";

export function ContactImportView() {
  const model = useContactImport();
  const theme = useSpTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ code?: string; state?: string; error?: string }>();
  const [showSource, setShowSource] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState("");
  const page = model.page.data;
  const job = page?.job;
  async function pickFile() {
    setCsv(""); setFileName("");
    let file: File | null = null;
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ["text/csv", "text/comma-separated-values", "text/plain", "application/csv"], copyToCacheDirectory: true });
      if (result.canceled) return;
      const asset = result.assets[0]!;
      file = new File(asset.uri);
      if (file.size > contactImportLimits.csvBytes) throw new Error("csv_too_large");
      setCsv(await file.text()); setFileName(asset.name); model.setError(null);
    } catch (error) { model.setError(importError(error)); }
    finally { if (file?.exists) file.delete(); }
  }
  return <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}><ScrollView contentContainerStyle={styles.content}>
    <SpButton tone="secondary" label="← Kişiler" onPress={() => router.replace("/(tabs)/contacts")} />
    <SpText variant="hero">{copy.title}</SpText><SpText color="secondary">{copy.intro}</SpText>
    {params.code && params.state ? <SpButton disabled={model.pending} label={copy.continueGoogle} onPress={() => { model.finish(params.state!, params.code!); router.setParams({ code: undefined, state: undefined }); }} /> : null}
    {params.error ? <SpText accessibilityRole="alert" color="ask">{copy.errors.google_failed}</SpText> : null}
    <View style={styles.actions}>{[copy.chooseSource, copy.reviewStep, copy.importStep].map((label, index) => <SpText key={label} variant="caption" color={(job?.status === "completed" ? 2 : job ? 1 : 0) === index ? "deed" : "secondary"}>{index + 1} · {label}</SpText>)}</View>
    {job ? <SpButton tone="quiet" label={copy.newImport} accessibilityState={{ expanded: showSource }} onPress={() => setShowSource(!showSource)} /> : null}
    {!job || showSource ? <SpCard style={styles.stack}>
      <SpButton tone="secondary" label={copy.google} disabled={model.pending || !model.google.data?.enabled} onPress={() => model.begin((url) => Linking.openURL(url))} />
      {model.google.data?.enabled === false ? <SpText color="secondary">{copy.googleUnavailable}</SpText> : null}
      {model.google.isError ? <SpText accessibilityRole="alert">{copy.error}</SpText> : null}
      <SpField label={copy.csv} hint={copy.csvHint}><SpButton tone="secondary" label={copy.chooseFile} disabled={model.pending} onPress={() => void pickFile()} /></SpField>
      {fileName ? <SpText variant="caption">{fileName}</SpText> : null}
      <SpButton label={model.pending ? copy.status.preparing : copy.preview} disabled={model.pending || !csv} onPress={() => model.prepare(csv, () => { setCsv(""); setFileName(""); setShowSource(false); })} />
    </SpCard> : null}
    {model.error ? <SpText accessibilityRole="alert" color="ask">{model.error}</SpText> : null}
    {model.page.isFetching && !page ? <SpText>{copy.status.preparing}</SpText> : null}
    {job ? <SpCard style={styles.stack}>
      <SpText variant="title" accessibilityLiveRegion="polite">{copy.status[job.status]}</SpText>
      <SpText variant="caption" color="secondary">{copy.source[job.source]} · {job.total} {copy.records}</SpText>
      {job.status !== "preview" ? <SpText variant="bodySmall">{job.processed}/{job.total} · {copy.result.created}: {job.created} · {copy.result.merged}: {job.merged} · {copy.result.skipped}: {job.skipped} · {copy.match.review}: {job.conflicts}</SpText> : null}
      {job.status === "processing" ? <SpText>{copy.background}</SpText> : null}
      {job.errorCode ? <SpText accessibilityRole="alert" color="ask">{copy.errors[job.errorCode] ?? copy.error}</SpText> : null}
      <View style={styles.actions}>
        <SpButton tone="quiet" label={copy.refresh} onPress={model.refresh} />
        {["preview", "preparing", "authorizing", "failed"].includes(job.status) ? <SpButton tone="quiet" label={copy.cancel} disabled={model.pending} onPress={() => model.control("cancel")} /> : null}
        {job.status === "failed" && job.errorCode === "import_failed" ? <SpButton label={copy.retry} disabled={model.pending} onPress={() => model.control("resume")} /> : null}
      </View>
      {job.status === "preview" ? <><SpText variant="bodySmall" color="secondary">{copy.previewGuide}</SpText><View style={styles.actions}><SpButton tone="quiet" label={copy.selectAll} disabled={model.pending} onPress={model.selectAll} /><SpButton tone="quiet" label={copy.clear} disabled={model.pending} onPress={model.excludeAll} /></View></> : null}
      {page?.rows.map((row) => <ImportPreviewRow key={row.id} row={row} preview={job.status === "preview"} selected={model.selected.has(row.id)} pending={model.pending} onToggle={() => model.toggle(row.id)} />)}
      <SpText variant="caption" color="secondary">{page?.rows.length ? `${model.cursor ? Number(model.cursor) + 2 : 1}–${(model.cursor ? Number(model.cursor) + 1 : 0) + page.rows.length} / ${job.total}` : "0"} {copy.records} {copy.shown}</SpText>
      <View style={styles.actions}>
        {model.cursor ? <SpButton tone="secondary" label={copy.previous} onPress={() => model.setCursor(null)} /> : null}
        {page?.nextCursor ? <SpButton tone="secondary" label={copy.next} onPress={() => model.setCursor(page.nextCursor)} /> : null}
      </View>
      {job.status === "preview" ? <><SpButton tone="quiet" label={copy.details} accessibilityState={{ expanded: showHelp }} onPress={() => setShowHelp(!showHelp)} />{showHelp ? <><SpText variant="bodySmall" color="secondary">{copy.selectionHelp}</SpText><SpText variant="bodySmall" color="secondary">{copy.matchHelp}</SpText></> : null}</> : null}
    </SpCard> : null}
    <SpButton tone="quiet" label={copy.history} accessibilityState={{ expanded: showHistory }} onPress={() => setShowHistory(!showHistory)} />
    {showHistory ? model.jobs.data?.length ? model.jobs.data.map((item) => <SpButton tone="secondary" key={item.id} label={`${copy.source[item.source]} · ${new Date(item.createdAt).toLocaleString("tr-TR")} · ${copy.status[item.status]}`} onPress={() => model.open(item.id)} />) : <SpText>{copy.empty}</SpText> : null}
  </ScrollView>{job?.status === "preview" ? <View style={[styles.selectionBar, { backgroundColor: theme.card, borderColor: theme.line }]}><SpText variant="bodySmall" color="deed" accessibilityLiveRegion="polite">{model.selected.size} {copy.selection} · {model.excludedCount} {copy.excludedCount}</SpText><SpButton label={copy.commit} disabled={model.pending || !model.selected.size} onPress={model.commit} /></View> : null}</SafeAreaView>;
}

const styles = StyleSheet.create({ safe: { flex: 1 }, content: { padding: space.lg, gap: space.lg, paddingBottom: space["3xl"] }, stack: { gap: space.md }, actions: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.sm }, selectionBar: { borderTopWidth: StyleSheet.hairlineWidth, padding: space.lg, gap: space.sm } });
