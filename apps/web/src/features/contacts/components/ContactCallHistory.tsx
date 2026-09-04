"use client";

import { useQuery } from "@tanstack/react-query";
import { apiQueryKeys, type CallRecordView } from "@spherepath/shared";
import { PhoneIncoming, PhoneMissed, PhoneOutgoing, RefreshCw } from "lucide-react";
import { SpCard } from "@/shared/ui/SpCard";
import { listContactCalls } from "../resources/calls";

function dateTime(value: number): string {
  return new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(value);
}

function spokenFor(milliseconds: number): string {
  const seconds = Math.round(milliseconds / 1_000);
  if (seconds < 60) return `${seconds} sn`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest ? `${minutes} dk ${rest} sn` : `${minutes} dk`;
}

/**
 * A missed call is the one row an advisor has to act on, so it reads differently
 * from a conversation that already produced a summary.
 */
function headline(call: CallRecordView): string {
  if (!call.answered) return call.direction === "inbound" ? "Cevapsız arama" : "Ulaşılamadı";
  return call.direction === "inbound" ? "Gelen arama" : call.direction === "outbound" ? "Giden arama" : "Dahili arama";
}

export function ContactCallHistory({ contactId }: { contactId: string }) {
  const query = useQuery({
    queryKey: apiQueryKeys.contactCalls(contactId),
    queryFn: () => listContactCalls(contactId),
  });
  const calls = query.data ?? [];
  if (!query.isPending && !query.error && !calls.length) return null;

  return (
    <SpCard>
    <section className="contact-detail-section contact-interaction-history" aria-labelledby="contact-calls-title">
      <div className="contact-history-heading">
        <div>
          <p className="eyebrow">TELEFON</p>
          <h3 id="contact-calls-title">Aramalar</h3>
        </div>
        {calls.length ? <span>{calls.length} arama</span> : null}
      </div>
      {query.isPending ? (
        <div className="contact-history-state"><RefreshCw className="spin" size={16} /> Aramalar yükleniyor…</div>
      ) : query.error ? (
        <p className="form-error">{query.error instanceof Error ? query.error.message : "Aramalar yüklenemedi."}</p>
      ) : (
        <ol className="contact-history-list">
          {calls.map((call) => {
            const Icon = !call.answered ? PhoneMissed : call.direction === "outbound" ? PhoneOutgoing : PhoneIncoming;
            return (
              <li className={call.answered ? "" : "contact-history-alert"} key={call.id}>
                <span className="contact-history-icon"><Icon size={15} aria-hidden /></span>
                <div>
                  <div className="contact-history-meta">
                    <strong>{headline(call)}</strong>
                    <time>{dateTime(call.startedAt ?? call.createdAt)}</time>
                  </div>
                  <p>{call.answered ? `${spokenFor(call.talkDurationMs)} görüşüldü.` : "Görüşme gerçekleşmedi; geri dönülmeyi bekliyor."}</p>
                  <div className="contact-history-tags">
                    {call.answered ? <span>Yalnız arama bilgisi</span> : null}
                    {call.contactCreatedFromCall ? <span>Bu aramayla eklendi</span> : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
    </SpCard>
  );
}
