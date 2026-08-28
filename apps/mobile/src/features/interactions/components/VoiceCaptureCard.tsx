import { useEffect, useRef, useState } from "react";
import { AppState, Pressable, StyleSheet, TextInput, View } from "react-native";
import { AlertTriangle, Check, LoaderCircle, Mic, Square } from "lucide-react-native";
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import {
  askOutcomeLabels,
  askOutcomes,
  interactionChannelLabels,
  interactionChannels,
  interactionObjectiveLabels,
  interactionObjectives,
  manualInteractionSchema,
  nextActionTypeLabels,
  nextActionTypes,
  sensitiveDataCategoryLabels,
  type ManualInteractionDraft,
  type VoiceNoteView,
} from "@spherepath/shared";
import type { WorkspaceSession } from "@/features/auth/resources/session";
import type { ContactRecord } from "@/features/contacts/resources/contacts";
import { SpCard } from "@/shared/ui/SpCard";
import { SpText } from "@/shared/ui/SpText";
import { radius, space } from "@/shared/ui/tokens.generated";
import { useSpTheme } from "@/shared/ui/theme";
import { confirmVoiceNote, getVoiceNote, uploadAndRegisterVoiceNote } from "../resources/interactions";

type VoiceStep = "idle" | "recording" | "uploading" | "processing" | "review" | "saved";

interface Props {
  session: WorkspaceSession;
  contacts: ContactRecord[];
  onSaved: () => Promise<void>;
}

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : "Sesli not işlenemedi.";
}

export function VoiceCaptureCard({ session, contacts, onSaved }: Props) {
  const theme = useSpTheme();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 250);
  const [step, setStep] = useState<VoiceStep>("idle");
  const [confirmedAlone, setConfirmedAlone] = useState(false);
  const [contactId, setContactId] = useState(contacts[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [voiceNote, setVoiceNote] = useState<VoiceNoteView | null>(null);
  const [channel, setChannel] = useState<ManualInteractionDraft["channel"]>("in_person");
  const [objective, setObjective] = useState<ManualInteractionDraft["objective"]>("get_acquainted");
  const [direction, setDirection] = useState<ManualInteractionDraft["direction"]>("mutual");
  const [outcome, setOutcome] = useState("");
  const [askOutcome, setAskOutcome] = useState<ManualInteractionDraft["askOutcome"]>("not_asked");
  const [noteSummary, setNoteSummary] = useState("");
  const [nextActionType, setNextActionType] = useState<ManualInteractionDraft["nextActionType"]>(null);
  const [nextActionDays, setNextActionDays] = useState<number | null>(null);
  const stoppingRef = useRef(false);
  const activeRef = useRef(true);

  useEffect(() => () => { activeRef.current = false; }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active" && recorder.isRecording) {
        stoppingRef.current = true;
        void recorder.stop().finally(() => {
          setError("Uygulama arka plana geçtiği için kayıt iptal edildi.");
          setStep("idle");
          stoppingRef.current = false;
        });
      }
    });
    return () => subscription.remove();
  }, [recorder]);

  useEffect(() => {
    if (step === "recording" && recorderState.durationMillis >= 45_000 && !stoppingRef.current) void stopRecording(true);
  });

  async function pollVoiceNote(voiceNoteId: string) {
    for (let attempt = 0; attempt < 45 && activeRef.current; attempt += 1) {
      const note = await getVoiceNote(voiceNoteId);
      if (note.status === "needs_review") {
        const draft = note.extraction?.interaction;
        setVoiceNote(note);
        setOutcome(draft?.outcome ?? "");
        setNoteSummary(draft?.noteSummary ?? "");
        setNextActionType(draft?.nextActionType ?? null);
        setNextActionDays(draft?.daysFromNow ?? null);
        setStep("review");
        return;
      }
      if (note.status === "failed") throw new Error("Ses işlenemedi. Lütfen yeniden kaydet.");
      await new Promise((resolve) => setTimeout(resolve, 2_000));
    }
    throw new Error("Ses işleme beklenenden uzun sürdü. Biraz sonra yeniden dene.");
  }

  async function startRecording() {
    if (!confirmedAlone) {
      setError("Önce görüşmenin bittiğini ve yalnız olduğunuzu onaylayın.");
      return;
    }
    setError(null);
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) throw new Error("Mikrofon izni olmadan sesli not kaydedilemez.");
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
        shouldPlayInBackground: false,
        interruptionMode: "doNotMix",
      });
      await recorder.prepareToRecordAsync();
      recorder.record({ forDuration: 45 });
      setStep("recording");
    } catch (nextError) {
      setError(messageFrom(nextError));
      setStep("idle");
    }
  }

  async function stopRecording(keep: boolean) {
    if (stoppingRef.current) return;
    stoppingRef.current = true;
    const durationMs = Math.min(45_000, recorderState.durationMillis);
    try {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false, shouldPlayInBackground: false });
      if (!keep || durationMs < 10_000) {
        setError(keep ? "Sesli not en az 10 saniye olmalı." : "Kayıt iptal edildi.");
        setStep("idle");
        return;
      }
      if (!recorder.uri) throw new Error("Ses dosyası oluşturulamadı.");
      setStep("uploading");
      const voiceNoteId = await uploadAndRegisterVoiceNote(session, contactId, recorder.uri, durationMs);
      setStep("processing");
      await pollVoiceNote(voiceNoteId);
    } catch (nextError) {
      setError(messageFrom(nextError));
      setStep("idle");
    } finally {
      stoppingRef.current = false;
    }
  }

  async function submitReview() {
    if (!voiceNote) return;
    const parsed = manualInteractionSchema.safeParse({
      contactId,
      channel,
      objective,
      direction,
      outcome,
      askOutcome,
      nextActionType,
      nextActionAt: nextActionType && nextActionDays !== null ? Date.now() + nextActionDays * 86_400_000 : null,
      noteSummary,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "İnceleme alanlarını kontrol edin.");
      return;
    }
    setStep("processing");
    setError(null);
    try {
      await confirmVoiceNote(session, voiceNote.id, parsed.data);
      await onSaved();
      setStep("saved");
    } catch (nextError) {
      setError(messageFrom(nextError));
      setStep("review");
    }
  }

  const inputStyle = [styles.input, { backgroundColor: theme.background, borderColor: theme.line, color: theme.textPrimary }];
  const choice = (selected: boolean) => [styles.choice, { backgroundColor: selected ? theme.deedBg : theme.background, borderColor: selected ? theme.deed : theme.line }];
  const seconds = Math.min(45, Math.floor(recorderState.durationMillis / 1_000));

  return (
    <SpCard style={styles.card}>
      <View style={styles.heading}><View style={[styles.icon, { backgroundColor: theme.askBg }]}><Mic color={theme.ask} size={20} /></View><View style={styles.flex}><SpText variant="eyebrow" color="ask">GÖRÜŞME SONRASI</SpText><SpText variant="title">10–45 saniyelik sesli not</SpText></View></View>
      {step === "idle" ? <View style={styles.stack}><SpText variant="bodySmall" color="secondary">Kişi</SpText><View style={styles.choices}>{contacts.map((contact) => <Pressable key={contact.id} onPress={() => setContactId(contact.id)} style={choice(contactId === contact.id)}><SpText variant="bodySmall" color={contactId === contact.id ? "deed" : "secondary"}>{contact.fullName ?? contact.label}</SpText></Pressable>)}</View><Pressable onPress={() => setConfirmedAlone((value) => !value)} style={[styles.confirm, { borderColor: confirmedAlone ? theme.deed : theme.line, backgroundColor: theme.background }]}><View style={[styles.checkbox, { borderColor: confirmedAlone ? theme.deed : theme.line, backgroundColor: confirmedAlone ? theme.deed : "transparent" }]}>{confirmedAlone ? <Check color={theme.onDeed} size={13} /> : null}</View><View style={styles.flex}><SpText variant="bodySmall">Görüşme bitti; karşı tarafı kaydetmiyorum.</SpText><SpText variant="caption" color="secondary">Yalnızca kendi özetinizi kaydedin. Aktif görüşme sırasında kullanmayın.</SpText></View></Pressable><Pressable disabled={!confirmedAlone} onPress={() => void startRecording()} style={[styles.primary, { backgroundColor: theme.ask, opacity: confirmedAlone ? 1 : .5 }]}><Mic color={theme.onAsk} size={18} /><SpText style={{ color: theme.onAsk }}>Kaydı başlat</SpText></Pressable></View> : null}
      {step === "recording" ? <View style={[styles.recording, { backgroundColor: theme.background }]}><View style={[styles.dot, { backgroundColor: theme.ask }]} /><SpText variant="title">00:{String(seconds).padStart(2, "0")}</SpText><SpText variant="bodySmall" color="secondary" style={styles.flex}>{seconds < 10 ? `${10 - seconds} sn daha` : "Kaydetmeye hazır"}</SpText><Pressable onPress={() => void stopRecording(true)} style={[styles.stop, { borderColor: theme.line }]}><Square color={theme.ask} fill={theme.ask} size={15} /><SpText variant="bodySmall">Durdur</SpText></Pressable></View> : null}
      {step === "uploading" || step === "processing" ? <View style={[styles.processing, { backgroundColor: theme.background }]}><LoaderCircle color={theme.deed} size={21} /><View style={styles.flex}><SpText variant="bodySmall">{step === "uploading" ? "Ses yükleniyor" : "Not güvenli biçimde işleniyor"}</SpText><SpText variant="caption" color="secondary">Transkript maskeleniyor ve onayınıza hazırlanıyor.</SpText></View></View> : null}
      {step === "review" && voiceNote ? <View style={styles.stack}><SpText variant="eyebrow" color="deed">İNCELE VE ONAYLA</SpText>{voiceNote.maskedCategories.length > 0 ? <View style={[styles.warning, { backgroundColor: theme.askBg }]}><AlertTriangle color={theme.ask} size={18} /><SpText variant="caption" color="ask" style={styles.flex}>{voiceNote.maskedCategories.map((category) => sensitiveDataCategoryLabels[category]).join(", ")} maskelendi.</SpText></View> : null}<SpText variant="bodySmall" color="secondary">Kanal</SpText><View style={styles.choices}>{interactionChannels.map((item) => <Pressable key={item} onPress={() => setChannel(item)} style={choice(channel === item)}><SpText variant="caption" color={channel === item ? "deed" : "secondary"}>{interactionChannelLabels[item]}</SpText></Pressable>)}</View><SpText variant="bodySmall" color="secondary">Amaç</SpText><View style={styles.choices}>{interactionObjectives.map((item) => <Pressable key={item} onPress={() => setObjective(item)} style={choice(objective === item)}><SpText variant="caption" color={objective === item ? "deed" : "secondary"}>{interactionObjectiveLabels[item]}</SpText></Pressable>)}</View><SpText variant="bodySmall" color="secondary">Yön</SpText><View style={styles.choices}>{(["mutual", "outbound", "inbound"] as const).map((item) => <Pressable key={item} onPress={() => setDirection(item)} style={choice(direction === item)}><SpText variant="caption" color={direction === item ? "deed" : "secondary"}>{item === "mutual" ? "Karşılıklı" : item === "outbound" ? "Giden" : "Gelen"}</SpText></Pressable>)}</View><SpText variant="bodySmall" color="secondary">Kısa sonuç</SpText><TextInput multiline value={outcome} onChangeText={setOutcome} style={[inputStyle, styles.multiline]} /><SpText variant="bodySmall" color="secondary">Maskelenmiş özet</SpText><TextInput multiline value={noteSummary} onChangeText={setNoteSummary} style={[inputStyle, styles.multiline]} /><SpText variant="bodySmall" color="secondary">Talep sonucu</SpText><View style={styles.choices}>{askOutcomes.map((item) => <Pressable key={item} onPress={() => setAskOutcome(item)} style={choice(askOutcome === item)}><SpText variant="caption" color={askOutcome === item ? "deed" : "secondary"}>{askOutcomeLabels[item]}</SpText></Pressable>)}</View><SpText variant="bodySmall" color="secondary">Sonraki aksiyon</SpText><View style={styles.choices}><Pressable onPress={() => { setNextActionType(null); setNextActionDays(null); }} style={choice(nextActionType === null)}><SpText variant="caption" color={nextActionType === null ? "deed" : "secondary"}>Henüz yok</SpText></Pressable>{nextActionTypes.map((item) => <Pressable key={item} onPress={() => { setNextActionType(item); setNextActionDays((value) => value ?? 1); }} style={choice(nextActionType === item)}><SpText variant="caption" color={nextActionType === item ? "deed" : "secondary"}>{nextActionTypeLabels[item]}</SpText></Pressable>)}</View>{nextActionType ? <TextInput keyboardType="number-pad" placeholder="Kaç gün sonra?" placeholderTextColor={theme.textTertiary} value={nextActionDays === null ? "" : String(nextActionDays)} onChangeText={(value) => setNextActionDays(value ? Number(value) : null)} style={inputStyle} /> : null}<Pressable onPress={() => void submitReview()} style={[styles.primary, { backgroundColor: theme.ask }]}><Check color={theme.onAsk} size={18} /><SpText style={{ color: theme.onAsk }}>İncelemeyi onayla ve kaydet</SpText></Pressable></View> : null}
      {step === "saved" ? <View style={[styles.processing, { backgroundColor: theme.deedBg }]}><Check color={theme.deed} size={21} /><View style={styles.flex}><SpText variant="bodySmall" color="deed">Temas kaydedildi</SpText><SpText variant="caption" color="secondary">Kaynak ses silindi.</SpText></View><Pressable onPress={() => { setStep("idle"); setConfirmedAlone(false); setVoiceNote(null); }}><SpText variant="bodySmall" color="deed">Yeni not</SpText></Pressable></View> : null}
      {error ? <View style={[styles.warning, { backgroundColor: theme.askBg }]}><SpText variant="bodySmall" color="ask">{error}</SpText></View> : null}
    </SpCard>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.lg }, heading: { flexDirection: "row", alignItems: "center", gap: space.md }, icon: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" }, flex: { flex: 1 }, stack: { gap: space.md }, choices: { flexDirection: "row", flexWrap: "wrap", gap: space.sm }, choice: { minHeight: 38, borderRadius: radius.sm, borderWidth: StyleSheet.hairlineWidth, justifyContent: "center", paddingHorizontal: space.md }, confirm: { minHeight: 68, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md }, checkbox: { width: 22, height: 22, borderRadius: 5, borderWidth: 1, alignItems: "center", justifyContent: "center" }, primary: { minHeight: 50, borderRadius: radius.md, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.sm }, recording: { minHeight: 72, borderRadius: radius.md, flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md }, dot: { width: 12, height: 12, borderRadius: 6 }, stop: { minHeight: 40, borderRadius: radius.sm, borderWidth: StyleSheet.hairlineWidth, flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.md }, processing: { minHeight: 68, borderRadius: radius.md, flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md }, warning: { borderRadius: radius.sm, flexDirection: "row", alignItems: "center", gap: space.sm, padding: space.md }, input: { minHeight: 48, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, padding: space.md, fontFamily: "Karla_400Regular", fontSize: 16 }, multiline: { minHeight: 84, textAlignVertical: "top" },
});
