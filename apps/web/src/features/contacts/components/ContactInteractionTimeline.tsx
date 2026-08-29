"use client";

import { useQuery } from "@tanstack/react-query";
import {
  apiQueryKeys,
  askOutcomeLabels,
  interactionChannelLabels,
  interactionObjectiveLabels,
  nextActionTypeLabels,
} from "@spherepath/shared";
import { MessageSquareText, RefreshCw } from "lucide-react";
import { listContactInteractions } from "../resources/contacts";

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
  const query = useQuery({
    queryKey: apiQueryKeys.contactInteractions(contactId),
    queryFn: () => listContactInteractions(contactId),
  });

  return (
    <section className="contact-detail-section contact-interaction-history" aria-labelledby="contact-history-title">
      <div className="contact-history-heading">
        <div>
          <p className="eyebrow">GÖRÜŞME GEÇMİŞİ</p>
          <h3 id="contact-history-title">Zaman çizelgesi</h3>
        </div>
        {query.data ? <span>{query.data.length} kayıt</span> : null}
      </div>
      {query.isPending ? (
        <div className="contact-history-state"><RefreshCw className="spin" size={16} /> Geçmiş yükleniyor…</div>
      ) : query.error ? (
        <p className="form-error">{messageFrom(query.error)}</p>
      ) : query.data?.length ? (
        <ol className="contact-history-list">
          {query.data.map((interaction) => (
            <li key={interaction.id}>
              <span className="contact-history-icon"><MessageSquareText size={15} aria-hidden /></span>
              <div>
                <div className="contact-history-meta">
                  <strong>{interactionObjectiveLabels[interaction.objective]}</strong>
                  <time>{dateTime(interaction.occurredAt)}</time>
                </div>
                <p>{interaction.outcome ?? "Temas kaydedildi."}</p>
                {interaction.noteSummary ? <small>{interaction.noteSummary}</small> : null}
                <div className="contact-history-tags">
                  <span>{interactionChannelLabels[interaction.channel]}</span>
                  <span>{askOutcomeLabels[interaction.askOutcome]}</span>
                  {interaction.nextActionType && interaction.nextActionAt ? (
                    <span>{nextActionTypeLabels[interaction.nextActionType]} · {dateTime(interaction.nextActionAt)}</span>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <div className="contact-history-state">Bu kişi için henüz görüşme kaydı yok.</div>
      )}
    </section>
  );
}
