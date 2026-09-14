"use client";

import { useState, type FormEvent } from "react";
import { X } from "lucide-react";
import {
  askOutcomeLabels,
  askOutcomes,
  interactionChannelLabels,
  interactionChannels,
  interactionDirectionLabels,
  interactionDirections,
  interactionEditSchema,
  interactionObjectiveLabels,
  interactionObjectives,
  interactionOccurredAtError,
  type InteractionEdit,
} from "@spherepath/shared";
import { QuickDateField } from "@/shared/ui/QuickDateField";
import { handleFormKeyDown, SpInput, SpSelect, SpTextarea } from "@/shared/ui/SpField";
import { useSheetDismiss } from "@/shared/ui/useSheetDismiss";
import type { ContactInteractionRecord } from "../resources/contacts";

function localDateTime(value: number): string {
  return new Date(value - new Date(value).getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function InteractionEditSheet({
  interaction,
  pending,
  onClose,
  onSave,
}: {
  interaction: ContactInteractionRecord;
  pending: boolean;
  onClose: () => void;
  onSave: (edit: InteractionEdit) => void;
}) {
  const [channel, setChannel] = useState(interaction.channel);
  const [objective, setObjective] = useState(interaction.objective);
  const [direction, setDirection] = useState(interaction.direction);
  const [outcome, setOutcome] = useState(interaction.outcome ?? "");
  const [askOutcome, setAskOutcome] = useState(interaction.askOutcome);
  const [noteSummary, setNoteSummary] = useState(interaction.noteSummary ?? "");
  const [occurredAt, setOccurredAt] = useState(() => localDateTime(interaction.occurredAt));
  const [error, setError] = useState<string | null>(null);

  useSheetDismiss(true, onClose);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const occurredAtMs = new Date(occurredAt).getTime();
    if (!Number.isFinite(occurredAtMs)) return setError("Görüşme tarihini kontrol et.");
    const timeError = interactionOccurredAtError(occurredAtMs, Date.now());
    if (timeError) return setError(timeError);
    const parsed = interactionEditSchema.safeParse({
      interactionId: interaction.id,
      channel, objective, direction, askOutcome,
      outcome: outcome.trim(),
      noteSummary: noteSummary.trim(),
      occurredAt: occurredAtMs,
    });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Görüşme bilgilerini kontrol et.");
    setError(null);
    onSave(parsed.data);
  }

  return (
    <div className="sheet-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target && !pending) onClose(); }}>
      <section className="form-sheet" role="dialog" aria-modal="true" aria-labelledby="interaction-edit-title">
        <div className="sheet-heading">
          <div>
            <p className="eyebrow">GÖRÜŞMEYİ DÜZENLE</p>
            <h2 id="interaction-edit-title">Kaydı düzelt veya tamamla</h2>
            <p className="privacy-copy">Görüşmenin kendi kaydı. Kişi, bağlı iş ve sonraki adım burada değişmez; takip için “Tamamla veya ertele”yi kullan.</p>
          </div>
          <button className="icon-action" aria-label="Kapat" disabled={pending} onClick={onClose} type="button"><X size={20} /></button>
        </div>
        <form onKeyDown={handleFormKeyDown} className="form-stack" onSubmit={submit}>
          <QuickDateField past required label="Görüşme ne zaman oldu" value={occurredAt} onChange={setOccurredAt} />
          <label>Kısa sonuç<SpTextarea required value={outcome} onChange={(event) => setOutcome(event.target.value)} /></label>
          <div className="form-row">
            <label>Kanal<SpSelect value={channel} onChange={(event) => setChannel(event.target.value as typeof channel)}>{interactionChannels.map((item) => <option key={item} value={item}>{interactionChannelLabels[item]}</option>)}</SpSelect></label>
            <label>Görüşme amacı<SpSelect value={objective} onChange={(event) => setObjective(event.target.value as typeof objective)}>{interactionObjectives.map((item) => <option key={item} value={item}>{interactionObjectiveLabels[item]}</option>)}</SpSelect></label>
          </div>
          <div className="form-row">
            <label>Yön<SpSelect value={direction} onChange={(event) => setDirection(event.target.value as typeof direction)}>{interactionDirections.map((item) => <option key={item} value={item}>{interactionDirectionLabels[item]}</option>)}</SpSelect></label>
            <label>Talep sonucu<SpSelect value={askOutcome} onChange={(event) => setAskOutcome(event.target.value as typeof askOutcome)}>{askOutcomes.map((item) => <option key={item} value={item}>{askOutcomeLabels[item]}</option>)}</SpSelect></label>
          </div>
          <label>Ek not <span className="optional">isteğe bağlı</span><SpTextarea value={noteSummary} onChange={(event) => setNoteSummary(event.target.value)} /></label>
          <SpInput name="occurredAt" type="hidden" value={occurredAt} />
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <button className="primary-action auth-submit" disabled={pending} type="submit">{pending ? "Kaydediliyor…" : "Değişiklikleri kaydet"}</button>
        </form>
      </section>
    </div>
  );
}
