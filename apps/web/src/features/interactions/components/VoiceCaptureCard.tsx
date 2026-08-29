"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Check, ContactRound, FileText, LoaderCircle, Mic, Square, Trash2, Upload } from "lucide-react";
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
  opportunityTypeLabels,
  propertyTransactionTypeLabels,
  sensitiveDataCategoryLabels,
  voicePropertyTypeLabels,
  type ManualInteractionDraft,
  type OpportunityType,
  type VoiceInsights,
  type VoiceNoteView,
} from "@spherepath/shared";
import type { WorkspaceSession } from "@/features/auth/resources/session";
import type { ContactRecord } from "@/features/contacts/resources/contacts";
import { SpCard } from "@/shared/ui/SpCard";
import { confirmVoiceNote, discardVoiceNote, getLatestReviewableVoiceNote, getVoiceNote, submitInteractionText, uploadAndRegisterVoiceNote } from "../resources/interactions";

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

function suggestedOpportunityType(insights: VoiceInsights | null | undefined): OpportunityType | null {
  if (!insights?.propertyPreferences.transactionType) return null;
  const transaction = insights.propertyPreferences.transactionType;
  if (insights.propertyContext === "subject_property") {
    if (transaction === "sell") return "seller_listing";
    if (transaction === "let") return "landlord_listing";
    return null;
  }
  if (transaction === "rent") return "tenant_requirement";
  if (transaction === "buy" || transaction === "invest") return "buyer_requirement";
  return null;
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
  const [confirmedAlone, setConfirmedAlone] = useState(false);
  const [contactId, setContactId] = useState(initialContactId || contacts[0]?.id || "");
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
  const [createOpportunity, setCreateOpportunity] = useState(false);
  const [opportunityType, setOpportunityType] = useState<OpportunityType | null>(null);
  const [textTranscript, setTextTranscript] = useState("");
  const [createdOpportunityId, setCreatedOpportunityId] = useState<string | null>(null);
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
    const suggestedType = suggestedOpportunityType(note.extraction?.insights);
    setOpportunityType(suggestedType);
    setCreateOpportunity(Boolean(suggestedType && draft?.nextActionType && draft.daysFromNow !== null));
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
      await new Promise((resolve) => setTimeout(resolve, 2_000));
    }
    throw new Error("Ses işleme beklenenden uzun sürdü. Biraz sonra yeniden dene.");
  }, [applyReview]);

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
        const durationMs = Math.min(45_000, Date.now() - startedAtRef.current);
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        stream.getTracks().forEach((track) => track.stop());
        if (durationMs < 10_000) {
          setError("Sesli not en az 10 saniye olmalı.");
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
        setSeconds(Math.min(elapsed, 45));
        if (elapsed >= 45 && recorder.state === "recording") recorder.stop();
      }, 250);
    } catch (nextError) {
      setError(messageFrom(nextError));
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
        propertyContext: includePropertyPreferences ? extractedInsights?.propertyContext ?? null : null,
        propertyPreferences: includePropertyPreferences && extractedInsights ? extractedInsights.propertyPreferences : {
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
        createOpportunity && opportunityType && parsed.data.nextActionType && parsed.data.nextActionAt
          ? { type: opportunityType, nextActionType: parsed.data.nextActionType, nextActionAt: parsed.data.nextActionAt }
          : null,
      );
      setCreatedOpportunityId(result.opportunityId);
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
    setConfirmedAlone(false);
    setVoiceNote(null);
    setInputMode(null);
    setSeconds(0);
    setApprovedKeyThings([]);
    setIncludePropertyPreferences(true);
    setCreateOpportunity(false);
    setOpportunityType(null);
    setNextActionTime(null);
    setTextTranscript("");
    setCreatedOpportunityId(null);
    setError(null);
  }

  const reviewInsights = voiceNote?.extraction?.insights;
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

  return (
    <SpCard className="voice-card">
      <div className="voice-heading"><div className="voice-icon"><Mic size={20} aria-hidden /></div><div><p className="eyebrow">GÖRÜŞME SONRASI</p><h2>10–45 saniyelik sesli not</h2></div></div>
      {step === "saved" ? <div className="voice-success"><Check size={20} aria-hidden /><div><strong>{createdOpportunityId ? "Temas, takip ve fırsat oluşturuldu" : "Temas kaydedildi"}</strong><span>{inputMode === "audio" ? "Ses dosyası silindi; yalnız maskelenmiş ve onaylanmış kayıt tutuluyor." : "Yazılı nottan yalnız maskelenmiş ve onaylanmış kayıt tutuluyor."}</span></div>{createdOpportunityId ? <Link className="secondary-action inline-link" href={`/opportunities?opportunityId=${encodeURIComponent(createdOpportunityId)}`}>Fırsatı görüntüle</Link> : null}<button className="secondary-action" type="button" onClick={reset}>Yeni not</button></div> : null}
      {step === "idle" ? <><div className="voice-setup"><label>Kişi<select value={contactId} onChange={(event) => setContactId(event.target.value)}>{contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.fullName ?? contact.label}</option>)}</select></label><label className="voice-confirm"><input type="checkbox" checked={confirmedAlone} onChange={(event) => setConfirmedAlone(event.target.checked)} /><span><strong>Görüşme bitti; karşı tarafı kaydetmiyorum.</strong><small>Bu özellik yalnızca kendi özetiniz içindir. Aktif görüşme sırasında kullanmayın.</small></span></label><button className="primary-action inline-action voice-start" type="button" disabled={!confirmedAlone} onClick={() => void startRecording()}><Mic size={18} aria-hidden /> Kaydı başlat</button></div><section className="voice-text-test"><div><p className="eyebrow">YAZILI GÖRÜŞME NOTU</p><h3>Notu yapılandır</h3><span>Not maskelenir, yapay zekâ ile yapılandırılır ve kaydetmeden önce incelemenize sunulur.</span></div><textarea maxLength={4_000} value={textTranscript} onChange={(event) => setTextTranscript(event.target.value)} placeholder="Örnek: Ayşe Hanım Kadıköy'de 3+1 bir daire arıyor. Bütçesi 12–15 milyon TL. Önümüzdeki hafta tekrar aramamı istedi." /><div className="voice-text-test-footer"><small>{textTranscript.length}/4000</small><button className="secondary-action inline-action" type="button" disabled={!contactId || textTranscript.trim().length < 2} onClick={() => void runInteractionText()}><FileText size={17} aria-hidden /> Yapılandır ve incele</button></div></section></> : null}
      {step === "recording" ? <div className="voice-recording" role="status"><span className="recording-dot" /><strong>00:{String(seconds).padStart(2, "0")}</strong><span>{seconds < 10 ? `Kaydetmek için ${10 - seconds} sn daha` : "Kaydetmeye hazır"}</span><button className="secondary-action inline-action" type="button" onClick={stopRecording}><Square size={16} fill="currentColor" aria-hidden /> Durdur</button></div> : null}
      {step === "uploading" || step === "processing" ? <div className="voice-processing" role="status">{step === "uploading" ? <Upload size={20} aria-hidden /> : <LoaderCircle className="spin" size={20} aria-hidden />}<div><strong>{step === "uploading" ? "Ses yükleniyor" : "Not arka planda hazırlanıyor"}</strong><span>Başka bir sayfaya geçebilirsiniz; taslak hazır olduğunda buraya döndüğünüzde inceleme açılır.</span></div></div> : null}
      {step === "review" && voiceNote ? <div className="voice-review"><div className="review-heading"><div><p className="eyebrow">İNCELE VE ONAYLA</p><h2>Çıkarılan temas taslağı</h2></div><span className="review-badge">{voiceNote.inputMode === "text_test" ? "Test metni · " : ""}Kullanıcı onayı gerekli</span></div><div className="voice-review-subject"><ContactRound size={18} aria-hidden /><span><small>BU KİŞİYE KAYDEDİLECEK</small><strong>{reviewContact?.fullName ?? reviewContact?.label ?? "Seçili kişi"}</strong></span><em>Yanlış kişiyse taslağı silip doğru kişiyi seçerek yeniden yapılandırın.</em></div>{voiceNote.maskedCategories.length > 0 ? <div className="masked-warning"><AlertTriangle size={18} aria-hidden /><span>{voiceNote.maskedCategories.map((category) => sensitiveDataCategoryLabels[category]).join(", ")} maskelendi ve yeniden gösterilmeyecek.</span></div> : null}<div className="voice-review-grid"><label>Kanal<select value={channel} onChange={(event) => setChannel(event.target.value as ManualInteractionDraft["channel"])}>{interactionChannels.map((item) => <option key={item} value={item}>{interactionChannelLabels[item]}</option>)}</select></label><label>Amaç<select value={objective} onChange={(event) => setObjective(event.target.value as ManualInteractionDraft["objective"])}>{interactionObjectives.map((item) => <option key={item} value={item}>{interactionObjectiveLabels[item]}</option>)}</select></label><label>Yön<select value={direction} onChange={(event) => setDirection(event.target.value as ManualInteractionDraft["direction"])}><option value="mutual">Karşılıklı</option><option value="outbound">Giden</option><option value="inbound">Gelen</option></select></label><label>Görüşme sonucu<select value={askOutcome} onChange={(event) => setAskOutcome(event.target.value as ManualInteractionDraft["askOutcome"])}>{askOutcomes.map((item) => <option key={item} value={item}>{askOutcomeLabels[item]}</option>)}</select></label><label className="wide">Kısa sonuç<textarea value={outcome} onChange={(event) => setOutcome(event.target.value)} /></label><label className="wide">Güvenli özet<textarea value={noteSummary} onChange={(event) => setNoteSummary(event.target.value)} /></label><label>Sonraki aksiyon<select value={nextActionType ?? ""} onChange={(event) => { const value = (event.target.value || null) as ManualInteractionDraft["nextActionType"]; setNextActionType(value); if (!value) { setNextActionDays(null); setNextActionTime(null); setCreateOpportunity(false); } }}><option value="">Henüz yok</option>{nextActionTypes.map((item) => <option key={item} value={item}>{nextActionTypeLabels[item]}</option>)}</select></label><label>Kaç gün sonra<input type="number" min="0" max="3650" disabled={!nextActionType} value={nextActionDays ?? ""} onChange={(event) => setNextActionDays(event.target.value ? Number(event.target.value) : null)} /></label><label>Saat (opsiyonel)<input type="time" disabled={!nextActionType} value={nextActionTime ?? ""} onChange={(event) => setNextActionTime(event.target.value || null)} /></label></div>{reviewInsights?.keyThingsToRemember.length ? <section className="voice-insight-panel"><div><p className="eyebrow">HATIRLANACAKLAR</p><h3>Önemli bilgiler</h3></div><div className="voice-memory-list">{reviewInsights.keyThingsToRemember.map((item) => <label className="voice-memory-item" key={item}><input type="checkbox" checked={approvedKeyThings.includes(item)} onChange={(event) => setApprovedKeyThings((current) => event.target.checked ? [...current, item] : current.filter((value) => value !== item))} /><span>{item}</span></label>)}</div></section> : null}{preferenceLabels.length ? <section className="voice-insight-panel">{isSubjectProperty ? <div className="voice-insight-toggle"><span><strong>Görüşülen gayrimenkul</strong><small>Bu bilgiler kişinin arama tercihlerine eklenmez.</small></span></div> : <label className="voice-insight-toggle"><input type="checkbox" checked={includePropertyPreferences} onChange={(event) => setIncludePropertyPreferences(event.target.checked)} /><span><strong>Gayrimenkul tercihlerini kişi hafızasına ekle</strong><small>Yanlış bir çıkarım varsa bu seçimi kaldırabilirsiniz.</small></span></label>}<div className="voice-insight-chips">{preferenceLabels.map((item) => <span key={item}>{item}</span>)}</div></section> : null}{opportunityType ? <section className="voice-insight-panel"><label className="voice-insight-toggle"><input type="checkbox" disabled={!nextActionType || nextActionDays === null} checked={createOpportunity} onChange={(event) => setCreateOpportunity(event.target.checked)} /><span><strong>Bu görüşmeden fırsat oluştur</strong><small>Temas, kişi hafızası, görev ve fırsat tek onayla kaydedilir.</small></span></label>{createOpportunity ? <label>Fırsat türü<select value={opportunityType} onChange={(event) => setOpportunityType(event.target.value as OpportunityType)}>{Object.entries(opportunityTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label> : null}</section> : null}{reviewInsights?.suggestedActionReason ? <div className="voice-action-reason"><strong>Önerilen aksiyon</strong><span>{reviewInsights.suggestedActionReason}</span></div> : null}<div className="voice-review-actions"><button className="secondary-action danger-secondary inline-action" type="button" onClick={() => void discardReview()}><Trash2 size={17} aria-hidden /> Vazgeç ve taslağı sil</button><button className="primary-action inline-action" type="button" onClick={() => void submitReview()}><Check size={18} aria-hidden /> Onayla ve işi oluştur</button></div></div> : null}
      {error ? <p className="form-error" role="alert">{error}</p> : null}
    </SpCard>
  );
}
