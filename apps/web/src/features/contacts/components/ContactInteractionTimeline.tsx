"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  apiQueryKeys,
  askOutcomeLabels,
  interactionChannelLabels,
  interactionObjectiveLabels,
  nextActionTypeLabels,
  type InteractionEdit,
} from "@spherepath/shared";
import { CalendarClock, Check, CircleSlash, MessageSquareText, Pencil, PhoneOff, RefreshCw } from "lucide-react";
import { useSession } from "@/features/auth/resources/session";
import { listContactInteractions, updateContactInteraction, type ContactInteractionRecord } from "../resources/contacts";
import { InteractionEditSheet } from "./InteractionEditSheet";

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : "Görüşme geçmişi yüklenemedi.";
}

function dateTime(value: number): string {
  return new Intl.DateTimeFormat("tr-TR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

export function ContactInteractionTimeline({ contactId }: { contactId: string }) {
  const { session } = useSession();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<ContactInteractionRecord | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const query = useQuery({
    queryKey: apiQueryKeys.contactInteractions(contactId),
    queryFn: () => listContactInteractions(contactId),
  });

  async function saveEdit(edit: InteractionEdit) {
    if (!session) return;
    setSavingEdit(true); setEditError(null);
    try {
      await updateContactInteraction(session, edit);
      // The correction moves the relationship summary with it, so the contact
      // itself has to be reread, not just this list.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: apiQueryKeys.contactInteractions(contactId) }),
        queryClient.invalidateQueries({ queryKey: apiQueryKeys.contacts }),
      ]);
      setEditing(null);
    } catch (error) {
      setEditError(error instanceof Error ? error.message : "Görüşme güncellenemedi.");
    } finally {
      setSavingEdit(false);
    }
  }
  const activities = query.data ? [
    ...query.data.interactions.map((interaction) => ({ kind: "interaction" as const, occurredAt: interaction.occurredAt, interaction })),
    ...query.data.taskOutcomes.map((outcome) => ({ kind: "task" as const, occurredAt: outcome.resolvedAt, outcome })),
  ].sort((left, right) => right.occurredAt - left.occurredAt) : [];

  const taskLabel = (taskId: string) => taskId.startsWith("opportunity-action-") ? "Fırsat takibi" : taskId.startsWith("first-interaction-") ? "İlk temas görevi" : "Sonraki adım";
  const statusLabel = { completed: "Görev tamamlandı", skipped: "Görev atlandı", rescheduled: "Görev ertelendi", contact_opt_out: "İletişim istemiyor" } as const;

  return (
    <section className="contact-detail-section contact-interaction-history" aria-labelledby="contact-history-title">
      <div className="contact-history-heading">
        <div>
          <p className="eyebrow">GÖRÜŞME GEÇMİŞİ</p>
          <h3 id="contact-history-title">Zaman çizelgesi</h3>
        </div>
        {query.data ? <span>{activities.length} kayıt</span> : null}
      </div>
      {query.isPending ? (
        <div className="contact-history-state"><RefreshCw className="spin" size={16} /> Geçmiş yükleniyor…</div>
      ) : query.error ? (
        <p className="form-error">{messageFrom(query.error)}</p>
      ) : activities.length ? (
        <ol className="contact-history-list">
          {activities.map((activity) => activity.kind === "interaction" ? (() => {
            const interaction = activity.interaction;
            return <li key={`interaction-${interaction.id}`}><span className="contact-history-icon"><MessageSquareText size={15} aria-hidden /></span><div><div className="contact-history-meta"><strong>{interactionObjectiveLabels[interaction.objective]}</strong><time>{dateTime(interaction.occurredAt)}</time><button aria-label={`${interactionObjectiveLabels[interaction.objective]} görüşmesini düzenle`} className="icon-action contact-history-edit" onClick={() => { setEditError(null); setEditing(interaction); }} title="Düzenle" type="button"><Pencil size={14} /></button></div><p>{interaction.outcome ?? "Temas kaydedildi."}</p>{interaction.noteSummary ? <small>{interaction.noteSummary}</small> : null}<div className="contact-history-tags"><span>{interactionChannelLabels[interaction.channel]}</span><span>{askOutcomeLabels[interaction.askOutcome]}</span>{interaction.nextActionType && interaction.nextActionAt ? <span>{nextActionTypeLabels[interaction.nextActionType]} · {dateTime(interaction.nextActionAt)}</span> : null}{interaction.editedAt ? <span>Düzenlendi</span> : null}</div></div></li>;
          })() : (() => {
            const outcome = activity.outcome;
            const Icon = outcome.status === "contact_opt_out" ? PhoneOff : outcome.status === "rescheduled" ? CalendarClock : outcome.status === "completed" ? Check : CircleSlash;
            return <li className={outcome.status === "contact_opt_out" ? "contact-history-alert" : ""} key={`task-${outcome.id}`}><span className="contact-history-icon"><Icon size={15} aria-hidden /></span><div><div className="contact-history-meta"><strong>{statusLabel[outcome.status]}</strong><time>{dateTime(outcome.resolvedAt)}</time></div><p>{outcome.note ?? (outcome.status === "rescheduled" && outcome.rescheduledAt ? `${dateTime(outcome.rescheduledAt)} tarihine ertelendi.` : "Sonuç kaydedildi.")}</p><div className="contact-history-tags"><span>{taskLabel(outcome.taskId)}</span>{outcome.rescheduledAt ? <span>Yeni tarih · {dateTime(outcome.rescheduledAt)}</span> : null}</div></div></li>;
          })())}
        </ol>
      ) : (
        <div className="contact-history-state">Bu kişi için henüz görüşme kaydı yok.</div>
      )}
      {editError ? <p className="form-error" role="alert">{editError}</p> : null}
      {editing ? (
        <InteractionEditSheet
          interaction={editing}
          pending={savingEdit}
          onClose={() => setEditing(null)}
          onSave={(edit) => void saveEdit(edit)}
        />
      ) : null}
    </section>
  );
}
