import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Pressable, StyleSheet, TextInput, View } from "react-native";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  LoaderCircle,
  Mic,
  SlidersHorizontal,
  Square,
  Trash2,
} from "lucide-react-native";
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
  microphoneErrorMessage,
  microphoneErrorMessages,
  nextActionTypeLabels,
  nextActionTypes,
  opportunityTypeLabels,
  propertyTransactionTypeLabels,
  sensitiveDataCategoryLabels,
  voicePropertyTypeLabels,
  type ManualInteractionDraft,
  type OpportunityType,
  type VoiceInsights,
  type VoiceNoteView,
  type VoicePropertySituation,
} from "@spherepath/shared";
import type { WorkspaceSession } from "@/features/auth/resources/session";
import type { ContactRecord } from "@/features/contacts/resources/contacts";
import { SpCard } from "@/shared/ui/SpCard";
import { SpText } from "@/shared/ui/SpText";
import { ContactPicker } from "@/shared/ui/ContactPicker";
import { radius, space } from "@/shared/ui/tokens.generated";
import { useSpTheme } from "@/shared/ui/theme";
import {
  confirmVoiceNote,
  discardVoiceNote,
  getLatestReviewableVoiceNote,
  getVoiceNote,
  retryVoiceNoteProcessing,
  uploadAndRegisterVoiceNote,
} from "../resources/interactions";

type VoiceStep =
  | "idle"
  | "recording"
  | "uploading"
  | "processing"
  | "review"
  | "saved";
let voiceSafetyConfirmedForSession = false;

interface Props {
  session: WorkspaceSession;
  contacts: ContactRecord[];
  onSaved: () => Promise<void>;
}

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : "Sesli not işlenemedi.";
}

function hasPropertyPreferences(
  insights: VoiceInsights | null | undefined,
): boolean {
  if (!insights) return false;
  const item = insights.propertyPreferences;
  return Boolean(
    item.transactionType ||
      item.propertyTypes.length ||
      item.preferredLocations.length ||
      item.budgetRange ||
      item.bedroomCountMin ||
      item.livingRoomCountMin ||
      item.roomCountMin ||
      item.areaMinM2 ||
      item.areaMaxM2 ||
      item.mustHaves.length ||
      item.dealBreakers.length ||
      item.timeline,
  );
}

function nextActionTimestamp(
  daysFromNow: number,
  actionTime: string | null,
): number {
  const scheduled = new Date();
  scheduled.setDate(scheduled.getDate() + daysFromNow);
  const [hours, minutes] = actionTime
    ? actionTime.split(":").map(Number)
    : [10, 0];
  scheduled.setHours(hours ?? 10, minutes ?? 0, 0, 0);
  return scheduled.getTime();
}

function additionalMustHaves(value: string): string[] {
  return [
    ...new Set(
      value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ].slice(0, 20);
}

function opportunityTypeForSituation(
  situation: Pick<VoicePropertySituation, "propertyContext" | "propertyPreferences">,
): OpportunityType | null {
  const transaction = situation.propertyPreferences.transactionType;
  if (situation.propertyContext === "subject_property") {
    if (transaction === "sell") return "seller_listing";
    if (transaction === "let") return "landlord_listing";
    return null;
  }
  if (transaction === "rent") return "tenant_requirement";
  if (transaction === "buy" || transaction === "invest")
    return "buyer_requirement";
  return null;
}

function suggestedOpportunityTypes(
  insights: VoiceInsights | null | undefined,
): OpportunityType[] {
  if (!insights) return [];
  const situations: Pick<VoicePropertySituation, "propertyContext" | "propertyPreferences">[] = insights.propertySituations.length
    ? insights.propertySituations
    : insights.propertyContext
      ? [{ propertyContext: insights.propertyContext, propertyPreferences: insights.propertyPreferences }]
      : [];
  return [...new Set(situations.map(opportunityTypeForSituation).filter((item): item is OpportunityType => item !== null))];
}

function formatRoomPreference(insights: VoiceInsights): string | null {
  const item = insights.propertyPreferences;
  if (item.bedroomCountMin !== null)
    return `En az ${item.bedroomCountMin}${item.livingRoomCountMin !== null ? `+${item.livingRoomCountMin}` : ""}`;
  return item.roomCountMin !== null ? `En az ${item.roomCountMin} oda` : null;
}

function formatAreaPreference(insights: VoiceInsights): string | null {
  const item = insights.propertyPreferences;
  if (item.areaMinM2 !== null && item.areaMaxM2 !== null)
    return item.areaMinM2 === item.areaMaxM2
      ? `${item.areaMinM2} m²`
      : `${item.areaMinM2}–${item.areaMaxM2} m²`;
  if (item.areaMinM2 !== null) return `En az ${item.areaMinM2} m²`;
  return item.areaMaxM2 !== null ? `En fazla ${item.areaMaxM2} m²` : null;
}

function formatBudget(insights: VoiceInsights): string | null {
  const budget = insights.propertyPreferences.budgetRange;
  if (!budget) return null;
  const formatter = new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: budget.currency,
    maximumFractionDigits: 0,
  });
  if (budget.min !== null && budget.max !== null)
    return `${formatter.format(budget.min)} – ${formatter.format(budget.max)}`;
  if (budget.min !== null) return `${formatter.format(budget.min)} ve üzeri`;
  return budget.max !== null ? `${formatter.format(budget.max)} ve altı` : null;
}

export function VoiceCaptureCard({ session, contacts, onSaved }: Props) {
  const theme = useSpTheme();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 250);
  const [step, setStep] = useState<VoiceStep>("idle");
  const [confirmedAlone, setConfirmedAlone] = useState(
    voiceSafetyConfirmedForSession,
  );
  const [contactId, setContactId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [voiceNote, setVoiceNote] = useState<VoiceNoteView | null>(null);
  const [channel, setChannel] =
    useState<ManualInteractionDraft["channel"]>("in_person");
  const [objective, setObjective] =
    useState<ManualInteractionDraft["objective"]>("get_acquainted");
  const [direction, setDirection] =
    useState<ManualInteractionDraft["direction"]>("mutual");
  const [outcome, setOutcome] = useState("");
  const [askOutcome, setAskOutcome] =
    useState<ManualInteractionDraft["askOutcome"]>("not_asked");
  const [noteSummary, setNoteSummary] = useState("");
  const [nextActionType, setNextActionType] =
    useState<ManualInteractionDraft["nextActionType"]>(null);
  const [nextActionDays, setNextActionDays] = useState<number | null>(null);
  const [nextActionTime, setNextActionTime] = useState<string | null>(null);
  const [approvedKeyThings, setApprovedKeyThings] = useState<string[]>([]);
  const [additionalMustHavesText, setAdditionalMustHavesText] = useState("");
  const [includePropertyPreferences, setIncludePropertyPreferences] =
    useState(true);
  const [selectedOpportunityTypes, setSelectedOpportunityTypes] =
    useState<OpportunityType[]>([]);
  const [showDetails, setShowDetails] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const stoppingRef = useRef(false);
  const activeRef = useRef(true);

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
    if (
      step === "recording" &&
      recorderState.durationMillis >= 90_000 &&
      !stoppingRef.current
    )
      void stopRecording(true);
  });

  const applyReview = useCallback((note: VoiceNoteView) => {
    const draft = note.extraction?.interaction;
    setVoiceNote(note);
    setContactId(note.contactId);
    if (draft?.channel) setChannel(draft.channel);
    if (draft?.objective) setObjective(draft.objective);
    if (draft?.direction) setDirection(draft.direction);
    setOutcome(draft?.outcome ?? "");
    if (draft?.askOutcome) setAskOutcome(draft.askOutcome);
    setNoteSummary(draft?.noteSummary ?? "");
    setNextActionType(draft?.nextActionType ?? null);
    setNextActionDays(draft?.nextActionType ? draft.daysFromNow : null);
    setNextActionTime(draft?.nextActionType ? draft.actionTime : null);
    setApprovedKeyThings(note.extraction?.insights?.keyThingsToRemember ?? []);
    setAdditionalMustHavesText("");
    setIncludePropertyPreferences(
      hasPropertyPreferences(note.extraction?.insights) &&
        note.extraction?.insights.propertyContext !== "subject_property",
    );
    const suggestedTypes = suggestedOpportunityTypes(note.extraction?.insights);
    setSelectedOpportunityTypes(draft?.nextActionType && draft.daysFromNow !== null ? suggestedTypes : []);
    setShowDetails(false);
    setShowTranscript(false);
    setStep("review");
  }, []);

  const pollVoiceNote = useCallback(
    async (voiceNoteId: string) => {
      for (let attempt = 0; attempt < 45 && activeRef.current; attempt += 1) {
        const note = await getVoiceNote(voiceNoteId);
        if (note.status === "needs_review") {
          applyReview(note);
          return;
        }
        if (note.status === "failed")
          throw new Error("Ses işlenemedi. Lütfen yeniden kaydet.");
        if (note.status === "queued" && [5, 15, 30].includes(attempt)) {
          await retryVoiceNoteProcessing(session, voiceNoteId).catch(
            () => undefined,
          );
          continue;
        }
        await new Promise((resolve) => setTimeout(resolve, 2_000));
      }
      throw new Error(
        "Sesli not güvende ancak işleme tamamlanamadı. Ekranı yeniden açtığınızda otomatik olarak yeniden denenecek.",
      );
    },
    [applyReview, session],
  );

  useEffect(() => {
    activeRef.current = true;
    let cancelled = false;
    void getLatestReviewableVoiceNote()
      .then((note) => {
        if (cancelled || !note) return;
        setContactId(note.contactId);
        if (note.status === "needs_review") {
          applyReview(note);
          return;
        }
        setStep("processing");
        void pollVoiceNote(note.id).catch((nextError) => {
          if (!cancelled) {
            setError(messageFrom(nextError));
            setStep("idle");
          }
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      activeRef.current = false;
    };
  }, [applyReview, pollVoiceNote]);

  async function startRecording() {
    if (!confirmedAlone) {
      setError("Önce görüşmenin bittiğini ve yalnız olduğunuzu onaylayın.");
      return;
    }
    setError(null);
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted)
        throw new Error(microphoneErrorMessages.permissionDenied);
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
        shouldPlayInBackground: false,
        interruptionMode: "doNotMix",
      });
      await recorder.prepareToRecordAsync();
      recorder.record({ forDuration: 90 });
      setStep("recording");
    } catch (nextError) {
      setError(microphoneErrorMessage(nextError));
      setStep("idle");
    }
  }

  async function stopRecording(keep: boolean) {
    if (stoppingRef.current) return;
    stoppingRef.current = true;
    const durationMs = Math.min(90_000, recorderState.durationMillis);
    try {
      await recorder.stop();
      await setAudioModeAsync({
        allowsRecording: false,
        shouldPlayInBackground: false,
      });
      if (!keep || durationMs < 5_000) {
        setError(
          keep ? "Sesli not en az 5 saniye olmalı." : "Kayıt iptal edildi.",
        );
        setStep("idle");
        return;
      }
      if (!recorder.uri) throw new Error("Ses dosyası oluşturulamadı.");
      setStep("uploading");
      const voiceNoteId = await uploadAndRegisterVoiceNote(
        session,
        contactId,
        recorder.uri,
        durationMs,
      );
      if (!voiceNoteId) {
        setStep("saved");
        setError(
          "Sesli not çevrimdışı kuyruğa alındı; bağlantı gelince gönderilecek.",
        );
        return;
      }
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
    if (nextActionTime && !/^([01]\d|2[0-3]):[0-5]\d$/u.test(nextActionTime)) {
      setError("Saati SS:DD biçiminde yazın.");
      return;
    }
    const parsed = manualInteractionSchema.safeParse({
      contactId,
      channel,
      objective,
      direction,
      outcome,
      askOutcome,
      nextActionType,
      nextActionAt:
        nextActionType && nextActionDays !== null
          ? nextActionTimestamp(nextActionDays, nextActionTime)
          : null,
      noteSummary,
    });
    if (!parsed.success) {
      setError(
        parsed.error.issues[0]?.message ?? "İnceleme alanlarını kontrol edin.",
      );
      return;
    }
    setStep("processing");
    setError(null);
    try {
      const extractedInsights = voiceNote.extraction?.insights;
      const approvedInsights: VoiceInsights = {
        keyThingsToRemember: approvedKeyThings,
        propertySituations: extractedInsights?.propertySituations ?? [],
        propertyContext: includePropertyPreferences
          ? (extractedInsights?.propertyContext ?? null)
          : null,
        propertyPreferences:
          includePropertyPreferences && extractedInsights
            ? {
                ...extractedInsights.propertyPreferences,
                mustHaves: [
                  ...new Set([
                    ...extractedInsights.propertyPreferences.mustHaves,
                    ...additionalMustHaves(additionalMustHavesText),
                  ]),
                ],
              }
            : {
                transactionType: null,
                propertyTypes: [],
                preferredLocations: [],
                budgetRange: null,
                bedroomCountMin: null,
                livingRoomCountMin: null,
                roomCountMin: null,
                areaMinM2: null,
                areaMaxM2: null,
                mustHaves: [],
                dealBreakers: [],
                timeline: null,
              },
        suggestedActionReason: extractedInsights?.suggestedActionReason ?? null,
      };
      await confirmVoiceNote(
        session,
        voiceNote.id,
        parsed.data,
        approvedInsights,
        parsed.data.nextActionType && parsed.data.nextActionAt
          ? selectedOpportunityTypes.map((type) => ({
              type,
              nextActionType: parsed.data.nextActionType!,
              nextActionAt: parsed.data.nextActionAt!,
            }))
          : [],
      );
      await onSaved();
      setStep("saved");
    } catch (nextError) {
      setError(messageFrom(nextError));
      setStep("review");
    }
  }

  async function discardReview() {
    if (!voiceNote) return;
    setStep("processing");
    setError(null);
    try {
      await discardVoiceNote(session, voiceNote.id);
      setVoiceNote(null);
      setApprovedKeyThings([]);
      setAdditionalMustHavesText("");
      setIncludePropertyPreferences(true);
      setSelectedOpportunityTypes([]);
      setNextActionTime(null);
      setShowTranscript(false);
      setStep("idle");
    } catch (nextError) {
      setError(messageFrom(nextError));
      setStep("review");
    }
  }

  const inputStyle = [
    styles.input,
    {
      backgroundColor: theme.background,
      borderColor: theme.line,
      color: theme.textPrimary,
    },
  ];
  const choice = (selected: boolean) => [
    styles.choice,
    {
      backgroundColor: selected ? theme.deedBg : theme.background,
      borderColor: selected ? theme.deed : theme.line,
    },
  ];
  const seconds = Math.min(
    90,
    Math.floor(recorderState.durationMillis / 1_000),
  );
  const reviewInsights = voiceNote?.extraction?.insights;
  const opportunitySuggestions = suggestedOpportunityTypes(reviewInsights);
  const isSubjectProperty =
    reviewInsights?.propertyContext === "subject_property";
  const preferenceLabels = reviewInsights
    ? [
        reviewInsights.propertyPreferences.transactionType
          ? propertyTransactionTypeLabels[
              reviewInsights.propertyPreferences.transactionType
            ]
          : null,
        ...reviewInsights.propertyPreferences.propertyTypes.map(
          (item) => voicePropertyTypeLabels[item],
        ),
        ...reviewInsights.propertyPreferences.preferredLocations,
        formatBudget(reviewInsights),
        formatRoomPreference(reviewInsights),
        formatAreaPreference(reviewInsights),
        ...reviewInsights.propertyPreferences.mustHaves.map((item) =>
          isSubjectProperty
            ? `Mülk özelliği: ${item}`
            : `Olmazsa olmaz: ${item}`,
        ),
        ...reviewInsights.propertyPreferences.dealBreakers.map((item) =>
          isSubjectProperty ? `Mülkte yok: ${item}` : `İstenmiyor: ${item}`,
        ),
        reviewInsights.propertyPreferences.timeline,
      ].filter((item): item is string => Boolean(item))
    : [];

  return (
    <SpCard style={styles.card}>
      <View style={styles.heading}>
        <View style={[styles.icon, { backgroundColor: theme.askBg }]}>
          <Mic color={theme.ask} size={20} />
        </View>
        <View style={styles.flex}>
          <SpText variant="eyebrow" color="ask">
            GÖRÜŞME SONRASI
          </SpText>
          <SpText variant="title">5–90 saniyelik sesli not</SpText>
        </View>
      </View>
      {step === "idle" ? (
        <View style={styles.stack}>
          <ContactPicker
            contacts={contacts}
            value={contactId}
            onChange={setContactId}
          />
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: confirmedAlone }}
            onPress={() => {
              const next = !confirmedAlone;
              voiceSafetyConfirmedForSession = next;
              setConfirmedAlone(next);
            }}
            style={[
              styles.confirm,
              {
                borderColor: confirmedAlone ? theme.deed : theme.line,
                backgroundColor: theme.background,
              },
            ]}
          >
            <View
              style={[
                styles.checkbox,
                {
                  borderColor: confirmedAlone ? theme.deed : theme.line,
                  backgroundColor: confirmedAlone ? theme.deed : "transparent",
                },
              ]}
            >
              {confirmedAlone ? <Check color={theme.onDeed} size={13} /> : null}
            </View>
            <View style={styles.flex}>
              <SpText variant="bodySmall">
                Görüşme bitti; karşı tarafı kaydetmiyorum.
              </SpText>
              <SpText variant="caption" color="secondary">
                Yalnızca kendi özetinizi kaydedin. Bu onay oturum boyunca
                hatırlanır.
              </SpText>
            </View>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={!confirmedAlone || !contactId}
            onPress={() => void startRecording()}
            style={[
              styles.primary,
              {
                backgroundColor: theme.ask,
                opacity: confirmedAlone && contactId ? 1 : 0.5,
              },
            ]}
          >
            <Mic color={theme.onAsk} size={18} />
            <SpText style={{ color: theme.onAsk }}>Kaydı başlat</SpText>
          </Pressable>
        </View>
      ) : null}
      {step === "recording" ? (
        <View style={[styles.recording, { backgroundColor: theme.background }]}>
          <View style={[styles.dot, { backgroundColor: theme.ask }]} />
          <SpText variant="title">
            {String(Math.floor(seconds / 60)).padStart(2, "0")}:
            {String(seconds % 60).padStart(2, "0")}
          </SpText>
          <SpText variant="bodySmall" color="secondary" style={styles.flex}>
            {seconds < 5 ? `${5 - seconds} sn daha` : "Kaydetmeye hazır"}
          </SpText>
          <Pressable
            onPress={() => void stopRecording(true)}
            style={[styles.stop, { borderColor: theme.line }]}
          >
            <Square color={theme.ask} fill={theme.ask} size={15} />
            <SpText variant="bodySmall">Durdur</SpText>
          </Pressable>
        </View>
      ) : null}
      {step === "uploading" || step === "processing" ? (
        <View
          style={[styles.processing, { backgroundColor: theme.background }]}
        >
          <LoaderCircle color={theme.deed} size={21} />
          <View style={styles.flex}>
            <SpText variant="bodySmall">
              {step === "uploading"
                ? "Ses yükleniyor"
                : "Not arka planda hazırlanıyor"}
            </SpText>
            <SpText variant="caption" color="secondary">
              Başka bir ekrana geçebilirsiniz; hazır taslak geri döndüğünüzde
              açılır.
            </SpText>
          </View>
        </View>
      ) : null}
      {step === "review" && voiceNote ? (
        <ContactPicker
          contacts={contacts}
          label="Bu kişiye kaydedilecek"
          value={contactId}
          onChange={setContactId}
        />
      ) : null}
      {step === "review" && voiceNote ? (
        <View style={styles.stack}>
          <SpText variant="eyebrow" color="deed">
            İNCELE VE ONAYLA
          </SpText>
          {voiceNote.maskedCategories.length > 0 ? (
            <View style={[styles.warning, { backgroundColor: theme.askBg }]}>
              <AlertTriangle color={theme.ask} size={18} />
              <SpText variant="caption" color="ask" style={styles.flex}>
                {voiceNote.maskedCategories
                  .map((category) => sensitiveDataCategoryLabels[category])
                  .join(", ")}{" "}
                maskelendi.
              </SpText>
            </View>
          ) : null}
          {voiceNote.extraction?.isUnclear ? (
            <View style={[styles.warning, { backgroundColor: theme.warmBg }]}>
              <AlertTriangle color={theme.warm} size={18} />
              <SpText variant="caption" style={styles.flex}>
                Not yeterince net çözülemedi. Duyulan metni kontrol edip eksik
                bilgileri düzenleyin.
              </SpText>
            </View>
          ) : null}
          {showDetails ? (
            <>
              <SpText variant="bodySmall" color="secondary">
                Kanal
              </SpText>
              <View style={styles.choices}>
                {interactionChannels.map((item) => (
                  <Pressable
                    key={item}
                    onPress={() => setChannel(item)}
                    style={choice(channel === item)}
                  >
                    <SpText
                      variant="caption"
                      color={channel === item ? "deed" : "secondary"}
                    >
                      {interactionChannelLabels[item]}
                    </SpText>
                  </Pressable>
                ))}
              </View>
              <SpText variant="bodySmall" color="secondary">
                Amaç
              </SpText>
              <View style={styles.choices}>
                {interactionObjectives.map((item) => (
                  <Pressable
                    key={item}
                    onPress={() => setObjective(item)}
                    style={choice(objective === item)}
                  >
                    <SpText
                      variant="caption"
                      color={objective === item ? "deed" : "secondary"}
                    >
                      {interactionObjectiveLabels[item]}
                    </SpText>
                  </Pressable>
                ))}
              </View>
              <SpText variant="bodySmall" color="secondary">
                Yön
              </SpText>
              <View style={styles.choices}>
                {(["mutual", "outbound", "inbound"] as const).map((item) => (
                  <Pressable
                    key={item}
                    onPress={() => setDirection(item)}
                    style={choice(direction === item)}
                  >
                    <SpText
                      variant="caption"
                      color={direction === item ? "deed" : "secondary"}
                    >
                      {item === "mutual"
                        ? "Karşılıklı"
                        : item === "outbound"
                          ? "Giden"
                          : "Gelen"}
                    </SpText>
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}
          <SpText variant="bodySmall" color="secondary">
            Kısa sonuç
          </SpText>
          <TextInput
            multiline
            value={outcome}
            onChangeText={setOutcome}
            style={[inputStyle, styles.multiline]}
          />
          <VoiceInsightsReview
            insights={reviewInsights}
            preferenceLabels={preferenceLabels}
            approvedKeyThings={approvedKeyThings}
            includePropertyPreferences={includePropertyPreferences}
            additionalMustHavesText={additionalMustHavesText}
            onKeyThingsChange={setApprovedKeyThings}
            onIncludePropertyPreferencesChange={setIncludePropertyPreferences}
            onAdditionalMustHavesChange={setAdditionalMustHavesText}
          />
          {!reviewInsights?.keyThingsToRemember.length &&
          !preferenceLabels.length ? (
            <View style={[styles.warning, { backgroundColor: theme.warmBg }]}>
              <AlertTriangle color={theme.warm} size={18} />
              <SpText variant="caption" style={styles.flex}>
                Konum, bütçe veya gayrimenkul tercihi çıkarılmadı. Duyulan metni
                kontrol edip gerekiyorsa kaydı yeniden deneyin.
              </SpText>
            </View>
          ) : null}
          {voiceNote.maskedTranscript ? (
            <>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: showTranscript }}
                onPress={() => setShowTranscript((current) => !current)}
                style={[styles.transcriptToggle, { borderColor: theme.line }]}
              >
                <View style={styles.flex}>
                  <SpText variant="bodySmall">Duyulan metni karşılaştır</SpText>
                  <SpText variant="caption" color="secondary">
                    Sistem konuşmanızı doğru yazıya çevirmiş mi?
                  </SpText>
                </View>
                <ChevronDown
                  color={theme.textSecondary}
                  size={20}
                  style={{ transform: [{ rotate: showTranscript ? "180deg" : "0deg" }] }}
                />
              </Pressable>
              {showTranscript ? (
                <View style={[styles.transcriptBox, { backgroundColor: theme.background, borderColor: theme.line }]}>
                  <SpText variant="bodySmall">{voiceNote.maskedTranscript}</SpText>
                </View>
              ) : null}
            </>
          ) : null}
          {showDetails ? (
            <>
              <SpText variant="bodySmall" color="secondary">
                Güvenli özet
              </SpText>
              <TextInput
                multiline
                value={noteSummary}
                onChangeText={setNoteSummary}
                style={[inputStyle, styles.multiline]}
              />
              <SpText variant="bodySmall" color="secondary">
                Talep sonucu
              </SpText>
              <View style={styles.choices}>
                {askOutcomes.map((item) => (
                  <Pressable
                    key={item}
                    onPress={() => setAskOutcome(item)}
                    style={choice(askOutcome === item)}
                  >
                    <SpText
                      variant="caption"
                      color={askOutcome === item ? "deed" : "secondary"}
                    >
                      {askOutcomeLabels[item]}
                    </SpText>
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}
          <SpText variant="bodySmall" color="secondary">
            Sonraki aksiyon
          </SpText>
          <View style={styles.choices}>
            <Pressable
              onPress={() => {
                setNextActionType(null);
                setNextActionDays(null);
                setNextActionTime(null);
                setSelectedOpportunityTypes([]);
              }}
              style={choice(nextActionType === null)}
            >
              <SpText
                variant="caption"
                color={nextActionType === null ? "deed" : "secondary"}
              >
                Henüz yok
              </SpText>
            </Pressable>
            {nextActionTypes.map((item) => (
              <Pressable
                key={item}
                onPress={() => setNextActionType(item)}
                style={choice(nextActionType === item)}
              >
                <SpText
                  variant="caption"
                  color={nextActionType === item ? "deed" : "secondary"}
                >
                  {nextActionTypeLabels[item]}
                </SpText>
              </Pressable>
            ))}
          </View>
          {nextActionType ? (
            <>
              <TextInput
                keyboardType="number-pad"
                placeholder="Kaç gün sonra?"
                placeholderTextColor={theme.textTertiary}
                value={nextActionDays === null ? "" : String(nextActionDays)}
                onChangeText={(value) =>
                  setNextActionDays(value ? Number(value) : null)
                }
                style={inputStyle}
              />
              <TextInput
                keyboardType="numbers-and-punctuation"
                placeholder="Saat (SS:DD, opsiyonel)"
                placeholderTextColor={theme.textTertiary}
                value={nextActionTime ?? ""}
                onChangeText={(value) => setNextActionTime(value || null)}
                style={inputStyle}
              />
            </>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: showDetails }}
            onPress={() => setShowDetails((current) => !current)}
            style={[
              styles.detailsToggle,
              {
                borderColor: showDetails ? theme.deed : theme.line,
                backgroundColor: showDetails ? theme.deedBg : theme.background,
              },
            ]}
          >
            <View style={[styles.detailsIcon, { backgroundColor: theme.deedBg }]}>
              <SlidersHorizontal color={theme.deed} size={19} />
            </View>
            <View style={styles.flex}>
              <SpText variant="bodySmall">
                {showDetails ? "Ayrıntıları gizle" : "Diğer ayrıntıları düzenle"}
              </SpText>
              <SpText variant="caption" color="secondary">
                Kanal, amaç, yön ve fırsat ayarları
              </SpText>
            </View>
            <ChevronDown
              color={theme.textSecondary}
              size={20}
              style={{ transform: [{ rotate: showDetails ? "180deg" : "0deg" }] }}
            />
          </Pressable>
          {opportunitySuggestions.length ? (
            <View style={styles.stack}>
              <SpText variant="bodySmall">Fırsat önerileri</SpText>
              <SpText variant="caption" color="secondary">
                {nextActionType && nextActionDays !== null
                  ? `${opportunitySuggestions.length} ayrı iş algılandı. Oluşturmak istediklerinizi seçin.`
                  : "Fırsat oluşturmak için önce bir sonraki adımı ve günü seçin."}
              </SpText>
              {opportunitySuggestions.map((item) => {
                const selected = selectedOpportunityTypes.includes(item);
                const enabled = Boolean(nextActionType && nextActionDays !== null);
                return (
                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: selected, disabled: !enabled }}
                    disabled={!enabled}
                    key={item}
                    onPress={() => setSelectedOpportunityTypes((current) => selected ? current.filter((type) => type !== item) : [...current, item])}
                    style={[styles.insightToggle, { opacity: enabled ? 1 : 0.55 }]}
                  >
                    <View style={[styles.checkbox, { borderColor: selected ? theme.deed : theme.line, backgroundColor: selected ? theme.deed : "transparent" }]}>
                      {selected ? <Check color={theme.onDeed} size={13} /> : null}
                    </View>
                    <SpText variant="bodySmall" style={styles.flex}>{opportunityTypeLabels[item]}</SpText>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
          <View style={styles.reviewActions}>
            <Pressable
              onPress={() => void discardReview()}
              style={[styles.secondary, { borderColor: theme.ask }]}
            >
              <Trash2 color={theme.ask} size={17} />
              <SpText color="ask">Vazgeç ve taslağı sil</SpText>
            </Pressable>
            <Pressable
              onPress={() => void submitReview()}
              style={[
                styles.primary,
                styles.flex,
                { backgroundColor: theme.ask },
              ]}
            >
              <Check color={theme.onAsk} size={18} />
              <SpText style={{ color: theme.onAsk }}>Onayla ve kaydet</SpText>
            </Pressable>
          </View>
        </View>
      ) : null}
      {step === "saved" ? (
        <View style={[styles.processing, { backgroundColor: theme.deedBg }]}>
          <Check color={theme.deed} size={21} />
          <View style={styles.flex}>
            <SpText variant="bodySmall" color="deed">
              Temas kaydedildi
            </SpText>
            <SpText variant="caption" color="secondary">
              Kaynak ses silindi.
            </SpText>
          </View>
          <Pressable
            onPress={() => {
              setStep("idle");
              setVoiceNote(null);
            }}
          >
            <SpText variant="bodySmall" color="deed">
              Yeni not
            </SpText>
          </Pressable>
        </View>
      ) : null}
      {error ? (
        <View style={[styles.warning, { backgroundColor: theme.askBg }]}>
          <SpText variant="bodySmall" color="ask">
            {error}
          </SpText>
        </View>
      ) : null}
    </SpCard>
  );
}

function VoiceInsightsReview({
  insights,
  preferenceLabels,
  approvedKeyThings,
  includePropertyPreferences,
  additionalMustHavesText,
  onKeyThingsChange,
  onIncludePropertyPreferencesChange,
  onAdditionalMustHavesChange,
}: {
  insights: VoiceInsights | null | undefined;
  preferenceLabels: string[];
  approvedKeyThings: string[];
  includePropertyPreferences: boolean;
  additionalMustHavesText: string;
  onKeyThingsChange(value: string[]): void;
  onIncludePropertyPreferencesChange(value: boolean): void;
  onAdditionalMustHavesChange(value: string): void;
}) {
  const theme = useSpTheme();
  if (
    !insights ||
    (!insights.keyThingsToRemember.length &&
      !preferenceLabels.length &&
      !insights.suggestedActionReason)
  )
    return null;
  return (
    <View style={styles.insights}>
      {insights.keyThingsToRemember.length ? (
        <View style={styles.stack}>
          <SpText variant="eyebrow" color="deed">
            HATIRLANACAKLAR
          </SpText>
          {insights.keyThingsToRemember.map((item) => {
            const selected = approvedKeyThings.includes(item);
            return (
              <Pressable
                key={item}
                onPress={() =>
                  onKeyThingsChange(
                    selected
                      ? approvedKeyThings.filter((value) => value !== item)
                      : [...approvedKeyThings, item],
                  )
                }
                style={[
                  styles.memoryItem,
                  {
                    borderColor: selected ? theme.deed : theme.line,
                    backgroundColor: theme.background,
                  },
                ]}
              >
                <View
                  style={[
                    styles.checkbox,
                    {
                      borderColor: selected ? theme.deed : theme.line,
                      backgroundColor: selected ? theme.deed : "transparent",
                    },
                  ]}
                >
                  {selected ? <Check color={theme.onDeed} size={13} /> : null}
                </View>
                <SpText variant="bodySmall" style={styles.flex}>
                  {item}
                </SpText>
              </Pressable>
            );
          })}
        </View>
      ) : null}
      {preferenceLabels.length ? (
        <View style={styles.stack}>
          {insights.propertyContext === "subject_property" ? (
            <View style={styles.insightToggle}>
              <View style={styles.flex}>
                <SpText variant="bodySmall">Görüşülen gayrimenkul</SpText>
                <SpText variant="caption" color="secondary">
                  Bu bilgiler kişinin arama tercihlerine eklenmez.
                </SpText>
              </View>
            </View>
          ) : (
            <Pressable
              onPress={() =>
                onIncludePropertyPreferencesChange(!includePropertyPreferences)
              }
              style={styles.insightToggle}
            >
              <View
                style={[
                  styles.checkbox,
                  {
                    borderColor: includePropertyPreferences
                      ? theme.deed
                      : theme.line,
                    backgroundColor: includePropertyPreferences
                      ? theme.deed
                      : "transparent",
                  },
                ]}
              >
                {includePropertyPreferences ? (
                  <Check color={theme.onDeed} size={13} />
                ) : null}
              </View>
              <View style={styles.flex}>
                <SpText variant="bodySmall">
                  Gayrimenkul tercihlerini kişi hafızasına ekle
                </SpText>
                <SpText variant="caption" color="secondary">
                  Yanlış bir çıkarım varsa bu seçimi kaldırabilirsiniz.
                </SpText>
              </View>
            </Pressable>
          )}
          <View style={styles.choices}>
            {preferenceLabels.map((item) => (
              <View
                key={item}
                style={[styles.insightChip, { backgroundColor: theme.deedBg }]}
              >
                <SpText variant="caption" color="deed">
                  {item}
                </SpText>
              </View>
            ))}
          </View>
          {insights.propertyContext !== "subject_property" &&
          includePropertyPreferences ? (
            <TextInput
              value={additionalMustHavesText}
              onChangeText={onAdditionalMustHavesChange}
              placeholder="Eksik tercih ekle (virgülle ayırın)"
              placeholderTextColor={theme.textTertiary}
              style={[
                styles.input,
                {
                  backgroundColor: theme.background,
                  borderColor: theme.line,
                  color: theme.textPrimary,
                },
              ]}
            />
          ) : null}
        </View>
      ) : null}
      {insights.suggestedActionReason ? (
        <View style={[styles.actionReason, { backgroundColor: theme.askBg }]}>
          <SpText variant="bodySmall" color="ask">
            Önerilen aksiyon
          </SpText>
          <SpText variant="caption" color="secondary">
            {insights.suggestedActionReason}
          </SpText>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.lg },
  heading: { flexDirection: "row", alignItems: "center", gap: space.md },
  icon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
  flex: { flex: 1 },
  stack: { gap: space.md },
  choices: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  choice: {
    minHeight: 38,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: "center",
    paddingHorizontal: space.md,
  },
  confirm: {
    minHeight: 68,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    padding: space.md,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 5,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  primary: {
    minHeight: 50,
    borderRadius: radius.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
  },
  secondary: {
    minHeight: 50,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
    paddingHorizontal: space.md,
  },
  detailsToggle: {
    minHeight: 68,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    padding: space.md,
  },
  detailsIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  transcriptToggle: {
    minHeight: 58,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    padding: space.md,
  },
  transcriptBox: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space.md,
  },
  reviewActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    flexWrap: "wrap",
  },
  recording: {
    minHeight: 72,
    borderRadius: radius.md,
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    padding: space.md,
  },
  dot: { width: 12, height: 12, borderRadius: 6 },
  stop: {
    minHeight: 40,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: space.md,
  },
  processing: {
    minHeight: 68,
    borderRadius: radius.md,
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    padding: space.md,
  },
  warning: {
    borderRadius: radius.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    padding: space.md,
  },
  input: {
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space.md,
    fontFamily: "Karla_400Regular",
    fontSize: 16,
  },
  multiline: { minHeight: 84, textAlignVertical: "top" },
  insights: { gap: space.md, padding: space.md, borderRadius: radius.md },
  memoryItem: {
    minHeight: 48,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    padding: space.md,
  },
  insightToggle: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space.sm,
  },
  insightChip: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.sm,
  },
  actionReason: { gap: space.xs, padding: space.md, borderRadius: radius.sm },
});
