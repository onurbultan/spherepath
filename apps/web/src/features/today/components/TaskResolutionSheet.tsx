"use client";

import Link from "next/link";
import { useState } from "react";
import { CalendarClock, Check, CircleSlash, PhoneOff, X } from "lucide-react";
import { dailyTaskOutcomeSchema, nextActionTypeLabels, nextActionTypes, type DailyTaskOutcome, type TodayTask } from "@spherepath/shared";
import { QuickDateField } from "@/shared/ui/QuickDateField";
import { useSheetDismiss } from "@/shared/ui/useSheetDismiss";
import { SpSelect, SpTextarea } from "@/shared/ui/SpField";

export function taskDueLabel(value: number | null): string {
  if (value === null) return "Tarihsiz";
  const due = new Date(value);
  const now = new Date();
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  if (due.toDateString() === yesterday.toDateString()) return `Gecikti · dün ${new Intl.DateTimeFormat("tr-TR", { hour: "2-digit", minute: "2-digit" }).format(due)}`;
  if (due.toDateString() === now.toDateString()) return `Bugün ${new Intl.DateTimeFormat("tr-TR", { hour: "2-digit", minute: "2-digit" }).format(due)}`;
  return new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(due);
}

export function tomorrowAtTen(): string {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(10, 0, 0, 0);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

/** Where the advisor goes to write up what actually happened on this task. */
export function taskRecordHref(task: TodayTask): string {
  // Finishing a listing means entering its price, which happens on the
  // portfolio page -- sending the advisor to the capture form instead would
  // ask them to record a conversation they did not have.
  // Returning a call starts on the contact, where the dial button is.
  if (task.type === "return_call") return `/contacts/__contact__?contactId=${encodeURIComponent(task.contactId)}`;
  if (task.type === "complete_listing") return "/listings";
  return task.opportunityId
    ? `/opportunities?opportunityId=${encodeURIComponent(task.opportunityId)}`
    : `/capture?contactId=${encodeURIComponent(task.contactId)}`;
}

/**
 * Closing a task is where the next action date, the interaction and the relationship
 * counters come from, so both the daily plan and the feed resolve tasks through this
 * one sheet rather than each having its own idea of what "done" means.
 */
export function TaskResolutionSheet({ task, pending, error, onClose, onResolve }: {
  task: TodayTask;
  pending: boolean;
  error: string | null;
  onClose(): void;
  onResolve(outcome: DailyTaskOutcome): void;
}) {
  const [status, setStatus] = useState<DailyTaskOutcome["status"]>("completed");
  const [note, setNote] = useState("");
  const [rescheduledAt, setRescheduledAt] = useState(tomorrowAtTen);
  const [rescheduledActionType, setRescheduledActionType] = useState<NonNullable<DailyTaskOutcome["rescheduledActionType"]>>("call");
  const [localError, setLocalError] = useState<string | null>(null);

  useSheetDismiss(true, () => { if (!pending) onClose(); });

  function submit() {
    const parsed = dailyTaskOutcomeSchema.safeParse({
      taskId: task.id,
      status,
      outcomeNote: status === "completed" ? note.trim() || null : null,
      skippedReason: status === "skipped" || status === "contact_opt_out" ? note.trim() || null : null,
      rescheduledAt: status === "rescheduled" && rescheduledAt ? new Date(rescheduledAt).getTime() : null,
      rescheduledActionType: status === "rescheduled" ? rescheduledActionType : null,
    });
    if (!parsed.success) {
      setLocalError(parsed.error.issues[0]?.message ?? "Görev sonucunu kontrol edin.");
      return;
    }
    setLocalError(null);
    onResolve(parsed.data);
  }

  return <div className="sheet-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target && !pending) onClose(); }}>
    <form className="form-sheet task-resolution-sheet" role="dialog" aria-modal="true" aria-labelledby="task-resolution-title" onSubmit={(event) => { event.preventDefault(); submit(); }}>
      <div className="sheet-heading">
        <div><p className="eyebrow">GÖREV SONUCU</p><h2 id="task-resolution-title">{task.title}</h2><span className="sheet-subtitle">{task.reason} · {taskDueLabel(task.dueAt)}</span></div>
        <button className="icon-action" aria-label="Kapat" disabled={pending} onClick={onClose} type="button"><X size={20} /></button>
      </div>
      <div className="task-resolution-choices" role="group" aria-label="Görev sonucu">
        <button className={status === "completed" ? "selected" : ""} onClick={() => { setStatus("completed"); setNote(""); }} type="button"><Check size={17} /><span><strong>Tamamlandı</strong><small>Bu aksiyonu kapat</small></span></button>
        <button className={status === "rescheduled" ? "selected" : ""} onClick={() => { setStatus("rescheduled"); setNote(""); }} type="button"><CalendarClock size={17} /><span><strong>Ertele</strong><small>Yeni tarih ve aksiyon belirle</small></span></button>
        <button className={status === "skipped" ? "selected" : ""} onClick={() => { setStatus("skipped"); setNote(""); }} type="button"><CircleSlash size={17} /><span><strong>Atla</strong><small>Yalnız bu görevi kapat</small></span></button>
        <button className={`danger-choice${status === "contact_opt_out" ? " selected" : ""}`} onClick={() => { setStatus("contact_opt_out"); setNote(""); }} type="button"><PhoneOff size={17} /><span><strong>İletişim istemiyor</strong><small>Gelecek iletişimleri kapat</small></span></button>
      </div>
      {status === "rescheduled"
        ? <div className="form-stack"><label>Yeni aksiyon<SpSelect value={rescheduledActionType} onChange={(event) => setRescheduledActionType(event.target.value as NonNullable<DailyTaskOutcome["rescheduledActionType"]>)}>{nextActionTypes.map((item) => <option key={item} value={item}>{nextActionTypeLabels[item]}</option>)}</SpSelect></label><QuickDateField label="Yeni tarih" value={rescheduledAt} onChange={setRescheduledAt} /></div>
        : <label>{status === "contact_opt_out" ? "İletişim neden kapatılıyor?" : status === "skipped" ? "Neden atlanıyor?" : "Kısa sonuç"} <span className="optional">{status === "completed" ? "isteğe bağlı" : ""}</span><SpTextarea required={status === "skipped" || status === "contact_opt_out"} value={note} onChange={(event) => setNote(event.target.value)} placeholder={status === "contact_opt_out" ? "Örn. Kişi telefon ve WhatsApp üzerinden iletişim kurulmasını istemiyor." : status === "skipped" ? "Örn. Bugün uygun değil; bu görevi kapatıyorum." : "Örn. Görüşüldü, teklif cuma günü paylaşılacak."} /></label>}
      {localError ?? error ? <p className="form-error" role="alert">{localError ?? error}</p> : null}
      <div className="task-resolution-actions">
        <Link className="secondary-action inline-link" href={taskRecordHref(task)}>Teması ayrıntılı kaydet</Link>
        <button className="primary-action inline-action" disabled={pending} type="submit">{pending ? "Kaydediliyor…" : status === "rescheduled" ? "Yeni tarihe ertele" : status === "contact_opt_out" ? "İletişimi kapat" : "Sonucu kaydet"}</button>
      </div>
    </form>
  </div>;
}
