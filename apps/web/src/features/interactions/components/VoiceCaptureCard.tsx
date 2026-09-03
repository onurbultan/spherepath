"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Check, ChevronDown, ContactRound, FileText, LoaderCircle, Mic, SlidersHorizontal, Square, Trash2, Upload } from "lucide-react";
import {
  askOutcomeLabels,
  askOutcomes,
  interactionChannelLabels,
  interactionChannels,
  interactionObjectiveLabels,
  interactionObjectives,
  manualInteractionSchema,
  microphoneErrorMessage,
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
import { ContactCombobox } from "@/shared/ui/ContactCombobox";
import { confirmVoiceNote, discardVoiceNote, getLatestReviewableVoiceNote, getVoiceNote, retryVoiceNoteProcessing, submitInteractionText, uploadAndRegisterVoiceNote } from "../resources/interactions";
import { SpInput, SpSelect, SpTextarea } from "@/shared/ui/SpField";

type VoiceStep = "idle" | "recording" | "uploading" | "processing" | "review" | "saved";

interface Props {
  session: WorkspaceSession;
  contacts: ContactRecord[];
  initialContactId?: string;
  onSaved: () => Promise<void>;
}

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : "Sesli not işlenemedi.";
}

function chooseMimeType() {
  if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) return "audio/webm;codecs=opus";
  if (MediaRecorder.isTypeSupported("audio/mp4")) return "audio/mp4";
  return "";
}

function hasPropertyPreferences(insights: VoiceInsights | null | undefined): boolean {
  if (!insights) return false;
  const item = insights.propertyPreferences;
  return Boolean(item.transactionType || item.propertyTypes.length || item.preferredLocations.length || item.budgetRange || item.bedroomCountMin || item.livingRoomCountMin || item.roomCountMin || item.areaMinM2 || item.areaMaxM2 || item.mustHaves.length || item.dealBreakers.length || item.timeline);
}

function nextActionTimestamp(daysFromNow: number, actionTime: string | null): number {
  const scheduled = new Date();
  scheduled.setDate(scheduled.getDate() + daysFromNow);
  const [hours, minutes] = actionTime ? actionTime.split(":").map(Number) : [10, 0];
  scheduled.setHours(hours ?? 10, minutes ?? 0, 0, 0);
  return scheduled.getTime();
}

function opportunityTypeForSituation(situation: Pick<VoicePropertySituation, "propertyContext" | "propertyPreferences">): OpportunityType | null {
  const transaction = situation.propertyPreferences.transactionType;
  if (situation.propertyContext === "subject_property") {
    if (transaction === "sell") return "seller_listing";
    if (transaction === "let") return "landlord_listing";
    return null;
  }
  if (transaction === "rent") return "tenant_requirement";
  if (transaction === "buy" || transaction === "invest") return "buyer_requirement";
  return null;
}

function suggestedOpportunityTypes(insights: VoiceInsights | null | undefined): OpportunityType[] {
  if (!insights) return [];
  const situations = insights.propertySituations.length
    ? insights.propertySituations
    : [{ propertyContext: insights.propertyContext, propertyPreferences: insights.propertyPreferences }].filter((item): item is VoicePropertySituation => item.propertyContext !== null).map((item) => ({ ...item, summary: "Gayrimenkul ihtiyacı" }));
  return [...new Set(situations.map(opportunityTypeForSituation).filter((item): item is OpportunityType => item !== null))];
}

function additionalMustHaves(value: string): string[] {
  return [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))].slice(0, 20);
}

function formatRoomPreference(insights: VoiceInsights): string | null {
  const item = insights.propertyPreferences;
  if (item.bedroomCountMin !== null) {
    return `En az ${item.bedroomCountMin}${item.livingRoomCountMin !== null ? `+${item.livingRoomCountMin}` : ""}`;
  }
  return item.roomCountMin !== null ? `En az ${item.roomCountMin} oda` : null;
}

function formatAreaPreference(insights: VoiceInsights): string | null {
  const item = insights.propertyPreferences;
  if (item.areaMinM2 !== null && item.areaMaxM2 !== null) return item.areaMinM2 === item.areaMaxM2 ? `${item.areaMinM2} m²` : `${item.areaMinM2}–${item.areaMaxM2} m²`;
  if (item.areaMinM2 !== null) return `En az ${item.areaMinM2} m²`;
  return item.areaMaxM2 !== null ? `En fazla ${item.areaMaxM2} m²` : null;
}

function formatBudget(insights: VoiceInsights): string | null {
  const budget = insights.propertyPreferences.budgetRange;
  if (!budget) return null;
  const formatter = new Intl.NumberFormat("tr-TR", { style: "currency", currency: budget.currency, maximumFractionDigits: 0 });
  if (budget.min !== null && budget.max !== null) return `${formatter.format(budget.min)} – ${formatter.format(budget.max)}`;
  if (budget.min !== null) return `${formatter.format(budget.min)} ve üzeri`;
  return budget.max !== null ? `${formatter.format(budget.max)} ve altı` : null;
}

export function VoiceCaptureCard({ session, contacts, initialContactId, onSaved }: Props) {
  const [step, setStep] = useState<VoiceStep>("idle");
  const [confirmedAlone, setConfirmedAlone] = useState(() => typeof window !== "undefined" && window.sessionStorage.getItem("spherepath-voice-safety-confirmed") === "yes");
  const [contactId, setContactId] = useState(initialContactId || "");
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [voiceNote, setVoiceNote] = useState<VoiceNoteView | null>(null);
  const [inputMode, setInputMode] = useState<VoiceNoteView["inputMode"] | null>(null);
  const [channel, setChannel] = useState<ManualInteractionDraft["channel"]>("in_person");
  const [objective, setObjective] = useState<ManualInteractionDraft["objective"]>("get_acquainted");
  const [direction, setDirection] = useState<ManualInteractionDraft["direction"]>("mutual");
  const [outcome, setOutcome] = useState("");
  const [askOutcome, setAskOutcome] = useState<ManualInteractionDraft["askOutcome"]>("not_asked");
  const [noteSummary, setNoteSummary] = useState("");
  const [nextActionType, setNextActionType] = useState<ManualInteractionDraft["nextActionType"]>(null);
  const [nextActionDays, setNextActionDays] = useState<number | null>(null);
  const [nextActionTime, setNextActionTime] = useState<string | null>(null);
  const [approvedKeyThings, setApprovedKeyThings] = useState<string[]>([]);
  const [includePropertyPreferences, setIncludePropertyPreferences] = useState(true);
  const [additionalMustHavesText, setAdditionalMustHavesText] = useState("");
  const [selectedOpportunityTypes, setSelectedOpportunityTypes] = useState<OpportunityType[]>([]);
  const [textTranscript, setTextTranscript] = useState("");
  const [createdOpportunityIds, setCreatedOpportunityIds] = useState<string[]>([]);
  const [queuedOffline, setQueuedOffline] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeRef = useRef(true);

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
    setIncludePropertyPreferences(hasPropertyPreferences(note.extraction?.insights) && note.extraction?.insights.propertyContext !== "subject_property");
    setAdditionalMustHavesText("");
    const suggestedTypes = suggestedOpportunityTypes(note.extraction?.insights);
    setSelectedOpportunityTypes(draft?.nextActionType && draft.daysFromNow !== null ? suggestedTypes : []);
    setStep("review");
  }, []);

  const pollVoiceNote = useCallback(async (voiceNoteId: string) => {
    for (let attempt = 0; attempt < 45 && activeRef.current; attempt += 1) {
      const note = await getVoiceNote(voiceNoteId);
      if (note.status === "needs_review") {
        applyReview(note);
        return;
      }
      if (note.status === "failed") throw new Error("Ses işlenemedi. Lütfen yeniden kaydet.");
      if (note.status === "queued" && [5, 15, 30].includes(attempt)) {
        await retryVoiceNoteProcessing(session, voiceNoteId).catch(() => undefined);
        continue;
      }
      await new Promise((resolve) => setTimeout(resolve, 2_000));
    }
    throw new Error("Sesli not güvende ancak işleme tamamlanamadı. Sayfayı yenilediğinizde otomatik olarak yeniden denenecek.");
  }, [applyReview, session]);

  useEffect(() => {
    activeRef.current = true;
    let cancelled = false;
    void getLatestReviewableVoiceNote().then((note) => {
      if (cancelled || !note) return;
      setContactId(note.contactId);
      setInputMode((current) => current ?? note.inputMode);
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
    }).catch(() => undefined);
    return () => {
      cancelled = true;
      activeRef.current = false;
      if (timerRef.current) clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, [applyReview, pollVoiceNote]);

  async function uploadRecording(blob: Blob, durationMs: number) {
    setInputMode("audio");
    setStep("uploading");
    try {
      const voiceNoteId = await uploadAndRegisterVoiceNote(session, contactId, blob, durationMs);
      if (!voiceNoteId) {
        setQueuedOffline(true);
        setStep("saved");
        return;
      }
      setQueuedOffline(false);
      setStep("processing");
      await pollVoiceNote(voiceNoteId);
    } catch (nextError) {
      setError(messageFrom(nextError));
      setStep("idle");
    }
  }

  async function runInteractionText() {
    const transcript = textTranscript.trim();
    if (transcript.length < 2) {
      setError("Kısa bir görüşme özeti yazın veya yapıştırın.");
      return;
    }
    if (!contactId) return;
    setError(null);
    setInputMode("manual_text");
    setStep("processing");
    try {
      const voiceNoteId = await submitInteractionText(session, contactId, transcript);
      await pollVoiceNote(voiceNoteId);
    } catch (nextError) {
      setError(messageFrom(nextError));
      setStep("idle");
    }
  }

  async function startRecording() {
    if (!confirmedAlone) {
      setError("Önce görüşmenin bittiğini ve yalnız olduğunuzu onaylayın.");
      return;
    }
    if (!contactId) return;
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = chooseMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType, audioBitsPerSecond: 128_000 } : undefined);
      streamRef.current = stream;
      recorderRef.current = recorder;
      chunksRef.current = [];
      startedAtRef.current = Date.now();
      recorder.ondataavailable = (event) => { if (event.data.size > 0) chunksRef.current.push(event.data); };
      recorder.onstop = () => {
        const durationMs = Math.min(90_000, Date.now() - startedAtRef.current);
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        stream.getTracks().forEach((track) => track.stop());
        if (durationMs < 5_000) {
          setError("Sesli not en az 5 saniye olmalı.");
          setStep("idle");
          return;
        }
        void uploadRecording(blob, durationMs);
      };
      recorder.start(500);
      setSeconds(0);
      setStep("recording");
      timerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startedAtRef.current) / 1_000);
        setSeconds(Math.min(elapsed, 90));
        if (elapsed >= 90 && recorder.state === "recording") recorder.stop();
      }, 250);
    } catch (nextError) {
      setError(microphoneErrorMessage(nextError));
      setStep("idle");
    }
  }

  function stopRecording() {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }

  async function submitReview() {
    if (!voiceNote) return;
    const nextActionAt = nextActionType && nextActionDays !== null
      ? nextActionTimestamp(nextActionDays, nextActionTime)
      : null;
    const parsed = manualInteractionSchema.safeParse({
      contactId,
      channel,
      objective,
      direction,
      outcome,
      askOutcome,
      nextActionType,
      nextActionAt,
      noteSummary,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "İnceleme alanlarını kontrol edin.");
      return;
    }
    setError(null);
    setStep("processing");
    try {
      const extractedInsights = voiceNote.extraction?.insights;
      const approvedInsights: VoiceInsights = {
        keyThingsToRemember: approvedKeyThings,
        // The capture flow already knows who it is about; the field exists for
        // notes that name someone the workspace has never seen.
        contactName: extractedInsights?.contactName ?? null,
        propertyContext: includePropertyPreferences ? extractedInsights?.propertyContext ?? null : null,
        propertySituations: extractedInsights?.propertySituations ?? [],
        propertyPreferences: includePropertyPreferences && extractedInsights ? {
          ...extractedInsights.propertyPreferences,
          mustHaves: [...new Set([
            ...extractedInsights.propertyPreferences.mustHaves,
            ...additionalMustHaves(additionalMustHavesText),
          ])].slice(0, 20),
        } : {
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
      const result = await confirmVoiceNote(
        session,
        voiceNote.id,
        parsed.data,
        approvedInsights,
        parsed.data.nextActionType && parsed.data.nextActionAt
          ? selectedOpportunityTypes.map((type) => ({ type, nextActionType: parsed.data.nextActionType!, nextActionAt: parsed.data.nextActionAt! }))
          : [],
      );
      setCreatedOpportunityIds(result.opportunityIds);
      await onSaved();
      setStep("saved");
    } catch (nextError) {
      setError(messageFrom(nextError));
      setStep("review");
    }
  }

  async function discardReview() {
    if (!voiceNote) return;
    setError(null);
    setStep("processing");
    try {
      await discardVoiceNote(session, voiceNote.id);
      reset();
    } catch (nextError) {
      setError(messageFrom(nextError));
      setStep("review");
    }
  }

  function reset() {
    setStep("idle");
    setVoiceNote(null);
    setInputMode(null);
    setSeconds(0);
    setApprovedKeyThings([]);
    setIncludePropertyPreferences(true);
    setAdditionalMustHavesText("");
    setSelectedOpportunityTypes([]);
    setNextActionTime(null);
    setTextTranscript("");
    setCreatedOpportunityIds([]);
    setQueuedOffline(false);
    setError(null);
  }

  const reviewInsights = voiceNote?.extraction?.insights;
  const opportunitySuggestions = suggestedOpportunityTypes(reviewInsights);
  const reviewContact = contacts.find((contact) => contact.id === contactId);
  const isSubjectProperty = reviewInsights?.propertyContext === "subject_property";
  const preferenceLabels = reviewInsights ? [
    reviewInsights.propertyPreferences.transactionType ? propertyTransactionTypeLabels[reviewInsights.propertyPreferences.transactionType] : null,
    ...reviewInsights.propertyPreferences.propertyTypes.map((item) => voicePropertyTypeLabels[item]),
    ...reviewInsights.propertyPreferences.preferredLocations,
    formatBudget(reviewInsights),
    formatRoomPreference(reviewInsights),
    formatAreaPreference(reviewInsights),
    ...reviewInsights.propertyPreferences.mustHaves.map((item) => isSubjectProperty ? `Mülk özelliği: ${item}` : `Olmazsa olmaz: ${item}`),
    ...reviewInsights.propertyPreferences.dealBreakers.map((item) => isSubjectProperty ? `Mülkte yok: ${item}` : `İstenmiyor: ${item}`),
    reviewInsights.propertyPreferences.timeline,
  ].filter((item): item is string => Boolean(item)) : [];
  const transcriptWordCount = voiceNote?.maskedTranscript?.trim().split(/\s+/u).filter(Boolean).length ?? 0;
  const transcriptPossiblyIncomplete = Boolean(voiceNote && voiceNote.inputMode === "audio" && (
    voiceNote.transcriptionWarning === "possibly_incomplete"
    || (voiceNote.durationMs >= 12_000 && transcriptWordCount < Math.max(6, Math.floor((voiceNote.durationMs / 1_000) * 0.35)))
  ));

  return (
    <SpCard className="voice-card">
      <div className="voice-heading"><div className="voice-icon"><Mic size={20} aria-hidden /></div><div><p className="eyebrow">GÖRÜŞME SONRASI</p><h2>5–90 saniyelik sesli not</h2></div></div>
      {step === "saved" ? <div className="voice-success"><Check size={20} aria-hidden /><div><strong>{queuedOffline ? "Sesli not cihazda güvende" : createdOpportunityIds.length ? `Temas, takip ve ${createdOpportunityIds.length} fırsat oluşturuldu` : "Temas kaydedildi"}</strong><span>{queuedOffline ? "Bağlantı gelince otomatik gönderilecek; bu sayfada beklemeniz gerekmiyor." : inputMode === "audio" ? "Ses dosyası silindi; yalnız maskelenmiş ve onaylanmış kayıt tutuluyor." : "Yazılı nottan yalnız maskelenmiş ve onaylanmış kayıt tutuluyor."}</span></div>{createdOpportunityIds[0] ? <Link className="secondary-action inline-link" href={`/opportunities?opportunityId=${encodeURIComponent(createdOpportunityIds[0])}`}>Fırsatları görüntüle</Link> : null}{!queuedOffline && contactId ? <Link className="secondary-action inline-link" href={`/listings?action=add-listing&ownerContactId=${encodeURIComponent(contactId)}`}>Yetkili portföy ekle</Link> : null}<button className="secondary-action" type="button" onClick={reset}>Yeni not</button></div> : null}
      {step === "idle" ? <><div className="voice-setup"><ContactCombobox contacts={contacts} value={contactId} onChange={setContactId} /><label className="voice-confirm"><SpInput type="checkbox" checked={confirmedAlone} onChange={(event) => { setConfirmedAlone(event.target.checked); if (event.target.checked) window.sessionStorage.setItem("spherepath-voice-safety-confirmed", "yes"); else window.sessionStorage.removeItem("spherepath-voice-safety-confirmed"); }} /><span><strong>Görüşme bitti; karşı tarafı kaydetmiyorum.</strong><small>Bu özellik yalnızca kendi özetiniz içindir. Aktif görüşme sırasında kullanmayın. Bu onay oturum boyunca hatırlanır.</small></span></label><button className="primary-action inline-action voice-start" type="button" disabled={!confirmedAlone || !contactId} onClick={() => void startRecording()}><Mic size={18} aria-hidden /> Kaydı başlat</button></div><details className="voice-text-test form-details"><summary>Ses yerine yazılı not kullan</summary><div><p className="eyebrow">YAZILI GÖRÜŞME NOTU</p><h3>Notu yapılandır</h3><span>Not maskelenir, yapılandırılır ve kaydetmeden önce incelemenize sunulur.</span></div><SpTextarea maxLength={4_000} value={textTranscript} onChange={(event) => setTextTranscript(event.target.value)} placeholder="Örnek: Ayşe Hanım Kadıköy'de 3+1 bir daire arıyor. Önümüzdeki hafta tekrar aramamı istedi." /><div className="voice-text-test-footer"><small>{textTranscript.length}/4000</small><button className="secondary-action inline-action" type="button" disabled={!contactId || textTranscript.trim().length < 2} onClick={() => void runInteractionText()}><FileText size={17} aria-hidden /> Yapılandır ve incele</button></div></details></> : null}
      {step === "recording" ? <div className="voice-recording" role="status"><span className="recording-dot" /><strong>{String(Math.floor(seconds / 60)).padStart(2, "0")}:{String(seconds % 60).padStart(2, "0")}</strong><span>{seconds < 5 ? `Kaydetmek için ${5 - seconds} sn daha` : "Kaydetmeye hazır"}</span><button className="secondary-action inline-action" type="button" onClick={stopRecording}><Square size={16} fill="currentColor" aria-hidden /> Durdur</button></div> : null}
      {step === "uploading" || step === "processing" ? <div className="voice-processing" role="status">{step === "uploading" ? <Upload size={20} aria-hidden /> : <LoaderCircle className="spin" size={20} aria-hidden />}<div><strong>{step === "uploading" ? "Ses yükleniyor" : "Not arka planda hazırlanıyor"}</strong><span>Başka bir sayfaya geçebilirsiniz; taslak hazır olduğunda buraya döndüğünüzde inceleme açılır.</span></div></div> : null}
      {step === "review" && voiceNote ? <><ContactCombobox contacts={contacts} label="Bu kişiye kaydedilecek" value={contactId} onChange={setContactId} /><details className="voice-advanced-toggle form-details"><summary><span className="voice-advanced-icon"><SlidersHorizontal size={19} aria-hidden /></span><span className="voice-advanced-copy"><strong>Diğer ayrıntıları düzenle</strong><small>Kanal, amaç, yön ve fırsat ayarlarını göster</small></span><ChevronDown className="voice-advanced-chevron" size={20} aria-hidden /></summary><p>Çıkarılan kanal, amaç, yön ve güvenli özeti aşağıda düzenleyebilirsiniz.</p></details></> : null}
      {step === "review" && voiceNote ? <div className="voice-review"><div className="review-heading"><div><p className="eyebrow">İNCELE VE ONAYLA</p><h2>Çıkarılan temas taslağı</h2></div><span className="review-badge">{voiceNote.inputMode === "text_test" ? "Test metni · " : ""}Kullanıcı onayı gerekli</span></div><div className="voice-review-subject"><ContactRound size={18} aria-hidden /><span><small>BU KİŞİYE KAYDEDİLECEK</small><strong>{reviewContact?.fullName ?? reviewContact?.label ?? "Seçili kişi"}</strong></span><em>Yanlış kişiyse yukarıdaki kişi alanından yeniden atayabilirsiniz.</em></div>{voiceNote.maskedCategories.length > 0 ? <div className="masked-warning"><AlertTriangle size={18} aria-hidden /><span>{voiceNote.maskedCategories.map((category) => sensitiveDataCategoryLabels[category]).join(", ")} maskelendi ve yeniden gösterilmeyecek.</span></div> : null}{transcriptPossiblyIncomplete ? <div className="voice-transcription-warning" role="alert"><AlertTriangle size={19} aria-hidden /><span><strong>Sesin yalnızca bir bölümü yazıya çevrilmiş olabilir.</strong><small>{Math.round(voiceNote.durationMs / 1_000)} saniyelik kayıttan yalnızca {transcriptWordCount} kelime duyuldu. Aşağıdaki metni kontrol et; eksikse bu taslağı onaylama.</small></span></div> : null}{voiceNote.maskedTranscript ? <details className="voice-transcript-comparison"><summary>Duyulan metni karşılaştır <ChevronDown size={18} aria-hidden /></summary><p>{voiceNote.maskedTranscript}</p></details> : null}<div className="voice-review-grid"><label>Kanal<SpSelect value={channel} onChange={(event) => setChannel(event.target.value as ManualInteractionDraft["channel"])}>{interactionChannels.map((item) => <option key={item} value={item}>{interactionChannelLabels[item]}</option>)}</SpSelect></label><label>Amaç<SpSelect value={objective} onChange={(event) => setObjective(event.target.value as ManualInteractionDraft["objective"])}>{interactionObjectives.map((item) => <option key={item} value={item}>{interactionObjectiveLabels[item]}</option>)}</SpSelect></label><label>Yön<SpSelect value={direction} onChange={(event) => setDirection(event.target.value as ManualInteractionDraft["direction"])}><option value="mutual">Karşılıklı</option><option value="outbound">Giden</option><option value="inbound">Gelen</option></SpSelect></label><label>Görüşme sonucu<SpSelect value={askOutcome} onChange={(event) => setAskOutcome(event.target.value as ManualInteractionDraft["askOutcome"])}>{askOutcomes.map((item) => <option key={item} value={item}>{askOutcomeLabels[item]}</option>)}</SpSelect></label><label className="wide">Kısa sonuç<SpTextarea value={outcome} onChange={(event) => setOutcome(event.target.value)} /></label><label className="wide">Güvenli özet<SpTextarea value={noteSummary} onChange={(event) => setNoteSummary(event.target.value)} /></label><label>Sonraki aksiyon<SpSelect value={nextActionType ?? ""} onChange={(event) => { const value = (event.target.value || null) as ManualInteractionDraft["nextActionType"]; setNextActionType(value); if (!value) { setNextActionDays(null); setNextActionTime(null); setSelectedOpportunityTypes([]); } }}><option value="">Henüz yok</option>{nextActionTypes.map((item) => <option key={item} value={item}>{nextActionTypeLabels[item]}</option>)}</SpSelect></label><label>Kaç gün sonra<SpInput type="number" min="0" max="3650" disabled={!nextActionType} value={nextActionDays ?? ""} onChange={(event) => setNextActionDays(event.target.value ? Number(event.target.value) : null)} /></label><label>Saat (opsiyonel)<SpInput type="time" disabled={!nextActionType} value={nextActionTime ?? ""} onChange={(event) => setNextActionTime(event.target.value || null)} /></label></div>{reviewInsights?.keyThingsToRemember.length ? <section className="voice-insight-panel"><div><p className="eyebrow">HATIRLANACAKLAR</p><h3>Önemli bilgiler</h3></div><div className="voice-memory-list">{reviewInsights.keyThingsToRemember.map((item) => <label className="voice-memory-item" key={item}><SpInput type="checkbox" checked={approvedKeyThings.includes(item)} onChange={(event) => setApprovedKeyThings((current) => event.target.checked ? [...current, item] : current.filter((value) => value !== item))} /><span>{item}</span></label>)}</div></section> : null}{preferenceLabels.length ? <section className="voice-insight-panel">{isSubjectProperty ? <div className="voice-insight-toggle"><span><strong>Görüşülen gayrimenkul</strong><small>Bu bilgiler kişinin arama tercihlerine eklenmez.</small></span></div> : <label className="voice-insight-toggle"><SpInput type="checkbox" checked={includePropertyPreferences} onChange={(event) => setIncludePropertyPreferences(event.target.checked)} /><span><strong>Gayrimenkul tercihlerini kişi hafızasına ekle</strong><small>Yanlış bir çıkarım varsa bu seçimi kaldırabilirsiniz.</small></span></label>}<div className="voice-insight-chips">{preferenceLabels.map((item) => <span key={item}>{item}</span>)}</div>{!isSubjectProperty && includePropertyPreferences ? <label>Eksik tercih ekle<SpInput value={additionalMustHavesText} onChange={(event) => setAdditionalMustHavesText(event.target.value)} placeholder="Örn. Sakin sokak, denize yürüme mesafesi" /></label> : null}</section> : null}{opportunitySuggestions.length ? <section className="voice-insight-panel"><div><p className="eyebrow">FIRSAT ÖNERİLERİ</p><h3>{opportunitySuggestions.length} ayrı iş algılandı</h3><small>{nextActionType && nextActionDays !== null ? "Oluşturmak istediklerinizi seçin." : "Fırsat oluşturmak için önce bir sonraki adımı ve günü seçin."}</small></div><div className="voice-memory-list">{opportunitySuggestions.map((type) => <label className="voice-memory-item" key={type}><SpInput type="checkbox" disabled={!nextActionType || nextActionDays === null} checked={selectedOpportunityTypes.includes(type)} onChange={(event) => setSelectedOpportunityTypes((current) => event.target.checked ? [...current, type] : current.filter((item) => item !== type))} /><span><strong>{opportunityTypeLabels[type]}</strong></span></label>)}</div></section> : null}{reviewInsights?.suggestedActionReason ? <div className="voice-action-reason"><strong>Önerilen aksiyon</strong><span>{reviewInsights.suggestedActionReason}</span></div> : null}<div className="voice-review-actions"><button className="secondary-action danger-secondary inline-action" type="button" onClick={() => void discardReview()}><Trash2 size={17} aria-hidden /> Vazgeç ve taslağı sil</button><button className="primary-action inline-action" type="button" onClick={() => void submitReview()}><Check size={18} aria-hidden /> Onayla ve işi oluştur</button></div></div> : null}
      {error ? <p className="form-error" role="alert">{error}</p> : null}
    </SpCard>
  );
}
