"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, LoaderCircle, Mic, Square, Upload } from "lucide-react";
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

function chooseMimeType() {
  if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) return "audio/webm;codecs=opus";
  if (MediaRecorder.isTypeSupported("audio/mp4")) return "audio/mp4";
  return "";
}

export function VoiceCaptureCard({ session, contacts, onSaved }: Props) {
  const [step, setStep] = useState<VoiceStep>("idle");
  const [confirmedAlone, setConfirmedAlone] = useState(false);
  const [contactId, setContactId] = useState(contacts[0]?.id ?? "");
  const [seconds, setSeconds] = useState(0);
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
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeRef = useRef(true);

  useEffect(() => () => {
    activeRef.current = false;
    if (timerRef.current) clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

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

  async function uploadRecording(blob: Blob, durationMs: number) {
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
      ? Date.now() + nextActionDays * 86_400_000
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
      await confirmVoiceNote(session, voiceNote.id, parsed.data);
      await onSaved();
      setStep("saved");
    } catch (nextError) {
      setError(messageFrom(nextError));
      setStep("review");
    }
  }

  function reset() {
    setStep("idle");
    setConfirmedAlone(false);
    setVoiceNote(null);
    setSeconds(0);
    setError(null);
  }

  return (
    <SpCard className="voice-card">
      <div className="voice-heading"><div className="voice-icon"><Mic size={20} aria-hidden /></div><div><p className="eyebrow">GÖRÜŞME SONRASI</p><h2>10–45 saniyelik sesli not</h2></div></div>
      {step === "saved" ? <div className="voice-success"><Check size={20} aria-hidden /><div><strong>Temas kaydedildi</strong><span>Ses dosyası silindi; yalnız maskelenmiş ve onaylanmış kayıt tutuluyor.</span></div><button className="secondary-action" type="button" onClick={reset}>Yeni sesli not</button></div> : null}
      {step === "idle" ? <div className="voice-setup"><label>Kişi<select value={contactId} onChange={(event) => setContactId(event.target.value)}>{contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.fullName ?? contact.label}</option>)}</select></label><label className="voice-confirm"><input type="checkbox" checked={confirmedAlone} onChange={(event) => setConfirmedAlone(event.target.checked)} /><span><strong>Görüşme bitti; karşı tarafı kaydetmiyorum.</strong><small>Bu özellik yalnızca kendi özetiniz içindir. Aktif görüşme sırasında kullanmayın.</small></span></label><button className="primary-action inline-action voice-start" type="button" disabled={!confirmedAlone} onClick={() => void startRecording()}><Mic size={18} aria-hidden /> Kaydı başlat</button></div> : null}
      {step === "recording" ? <div className="voice-recording" role="status"><span className="recording-dot" /><strong>00:{String(seconds).padStart(2, "0")}</strong><span>{seconds < 10 ? `Kaydetmek için ${10 - seconds} sn daha` : "Kaydetmeye hazır"}</span><button className="secondary-action inline-action" type="button" onClick={stopRecording}><Square size={16} fill="currentColor" aria-hidden /> Durdur</button></div> : null}
      {step === "uploading" || step === "processing" ? <div className="voice-processing" role="status">{step === "uploading" ? <Upload size={20} aria-hidden /> : <LoaderCircle className="spin" size={20} aria-hidden />}<div><strong>{step === "uploading" ? "Ses yükleniyor" : "Not güvenli biçimde işleniyor"}</strong><span>Transkript maskeleniyor ve onayınıza hazırlanıyor.</span></div></div> : null}
      {step === "review" && voiceNote ? <div className="voice-review"><div className="review-heading"><div><p className="eyebrow">İNCELE VE ONAYLA</p><h2>Çıkarılan temas taslağı</h2></div><span className="review-badge">Kullanıcı onayı gerekli</span></div>{voiceNote.maskedCategories.length > 0 ? <div className="masked-warning"><AlertTriangle size={18} aria-hidden /><span>{voiceNote.maskedCategories.map((category) => sensitiveDataCategoryLabels[category]).join(", ")} maskelendi ve yeniden gösterilmeyecek.</span></div> : null}<div className="voice-review-grid"><label>Kanal<select value={channel} onChange={(event) => setChannel(event.target.value as ManualInteractionDraft["channel"])}>{interactionChannels.map((item) => <option key={item} value={item}>{interactionChannelLabels[item]}</option>)}</select></label><label>Amaç<select value={objective} onChange={(event) => setObjective(event.target.value as ManualInteractionDraft["objective"])}>{interactionObjectives.map((item) => <option key={item} value={item}>{interactionObjectiveLabels[item]}</option>)}</select></label><label>Yön<select value={direction} onChange={(event) => setDirection(event.target.value as ManualInteractionDraft["direction"])}><option value="mutual">Karşılıklı</option><option value="outbound">Giden</option><option value="inbound">Gelen</option></select></label><label>Talep sonucu<select value={askOutcome} onChange={(event) => setAskOutcome(event.target.value as ManualInteractionDraft["askOutcome"])}>{askOutcomes.map((item) => <option key={item} value={item}>{askOutcomeLabels[item]}</option>)}</select></label><label className="wide">Kısa sonuç<textarea value={outcome} onChange={(event) => setOutcome(event.target.value)} /></label><label className="wide">Maskelenmiş özet<textarea value={noteSummary} onChange={(event) => setNoteSummary(event.target.value)} /></label><label>Sonraki aksiyon<select value={nextActionType ?? ""} onChange={(event) => { const value = (event.target.value || null) as ManualInteractionDraft["nextActionType"]; setNextActionType(value); if (!value) setNextActionDays(null); }}><option value="">Henüz yok</option>{nextActionTypes.map((item) => <option key={item} value={item}>{nextActionTypeLabels[item]}</option>)}</select></label><label>Kaç gün sonra<input type="number" min="0" max="3650" disabled={!nextActionType} value={nextActionDays ?? ""} onChange={(event) => setNextActionDays(event.target.value ? Number(event.target.value) : null)} /></label></div><button className="primary-action inline-action" type="button" onClick={() => void submitReview()}><Check size={18} aria-hidden /> İncelemeyi onayla ve kaydet</button></div> : null}
      {error ? <p className="form-error" role="alert">{error}</p> : null}
    </SpCard>
  );
}
