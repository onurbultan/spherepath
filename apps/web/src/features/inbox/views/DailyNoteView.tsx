"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCheck, ListChecks, Mic, NotebookPen, RefreshCw } from "lucide-react";
import {
  apiQueryKeys,
  commercialQueryKeys,
  findDailyPage,
  istanbulDayKey,
  noteMaxLength,
  type ApplyNoteSegmentsInput,
  type InboxItemRecord,
} from "@spherepath/shared";
import { useSession } from "@/features/auth/resources/session";
import { AppShell } from "@/shared/ui/AppShell";
import { listContacts } from "@/features/contacts/resources/contacts";
import { applyNotePage, changeInboxItem, createInboxNote, listInboxItems } from "../resources/inbox";
import { NotePageReview } from "../components/NotePageReview";

const messageFrom = (error: unknown) => error instanceof Error ? error.message : "Not kaydedilemedi.";

/**
 * A day's page, the way an advisor already keeps one: open it, write what
 * happened, close it. There is nothing to classify and nobody to pick before
 * typing -- the page is cut into its items afterwards, and the advisor decides
 * what each one becomes.
 *
 * One page per day, added to rather than replaced, because that is what a
 * notebook is. The structured conversation form has not gone anywhere; it is
 * now reached from a line that turns out to need it.
 */
export function DailyNoteView() {
  const { session } = useSession();
  const queryClient = useQueryClient();
  const [openedAt] = useState(() => Date.now());
  const [dayKey] = useState(() => istanbulDayKey(Date.now()));
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [applyPending, setApplyPending] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);

  const inbox = useQuery({
    queryKey: apiQueryKeys.inboxItems,
    queryFn: () => listInboxItems(session ?? undefined),
    enabled: Boolean(session),
    refetchInterval: (query) => (query.state.data as InboxItemRecord[] | undefined)?.some((item) => item.analysisStatus === "pending") ? 1_500 : false,
  });
  const contacts = useQuery({ queryKey: apiQueryKeys.contacts, queryFn: listContacts, enabled: Boolean(session) });

  const page = findDailyPage(inbox.data ?? [], dayKey);
  const waiting = (page?.segments ?? []).filter((segment) => segment.appliedAt === null);

  // The page's own text is the starting value. The moment the advisor types,
  // the draft is theirs and a background refetch cannot take it back.
  const text = draft ?? page?.safeText ?? "";

  async function save() {
    if (!session || !text.trim()) return;
    setSaving(true); setError(null);
    try {
      if (page) await changeInboxItem(session, { inboxItemId: page.id, text: text.trim() });
      else await createInboxNote(session, text.trim(), dayKey);
      await queryClient.invalidateQueries({ queryKey: apiQueryKeys.inboxItems });
      setSavedAt(true);
    } catch (next) { setError(messageFrom(next)); }
    finally { setSaving(false); }
  }

  async function apply(input: ApplyNoteSegmentsInput) {
    if (!session) return;
    setApplyPending(true); setApplyError(null);
    try {
      await applyNotePage(session, input);
      await Promise.all(commercialQueryKeys.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
      await inbox.refetch();
      setReviewOpen(false);
    } catch (next) { setApplyError(messageFrom(next)); }
    finally { setApplyPending(false); }
  }

  const dateLabel = new Intl.DateTimeFormat("tr-TR", { dateStyle: "full" }).format(openedAt);
  const dirty = text.trim() !== (page?.safeText ?? "");
  const reading = page?.analysisStatus === "pending";

  return (
    <AppShell>
      <header className="page-header daily-note-header">
        <div>
          <p className="eyebrow">GÜNLÜK NOT</p>
          <h1>{dateLabel}</h1>
          <p className="context-sentence">Aklındakini olduğu gibi yaz. Satırlara ayırmayı ve neye dönüşeceğini sonra birlikte kararlaştırırız.</p>
        </div>
        <div className="header-actions">
          <Link className="secondary-action inline-link" href="/capture"><Mic size={17} /> Sesli anlat</Link>
        </div>
      </header>

      <section className="daily-note-sheet" aria-label="Günün notu">
        <textarea
          aria-label="Günün notu"
          className="daily-note-area"
          maxLength={noteMaxLength}
          onChange={(event) => { setDraft(event.target.value); setSavedAt(false); }}
          placeholder={"Ayşe ve Murat ile tanıştım, Zeytinler'de ikiz villaları var\nAkın'ın 4 dönüm tarlası için yetki aldım\n\nYapılacaklar\n\nGökhan'a tarlanın durumunu yaz\nHüseyin Çeşme altında villalık arsa arıyor"}
          value={text}
        />
        <div className="daily-note-footer">
          <span className="daily-note-count">{text.length.toLocaleString("tr-TR")} / {noteMaxLength.toLocaleString("tr-TR")}</span>
          {savedAt && !dirty ? <span className="daily-note-saved"><CheckCheck size={15} aria-hidden /> Kaydedildi</span> : null}
          <button className="primary-action" disabled={saving || !dirty || !text.trim()} onClick={() => void save()} type="button">
            {saving ? "Kaydediliyor…" : page ? "Sayfayı güncelle" : "Sayfayı kaydet"}
          </button>
        </div>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
      </section>

      {page ? (
        <section className="daily-note-status" aria-label="Sayfanın durumu">
          {reading ? (
            <p className="content-state"><RefreshCw className="spin" size={16} aria-hidden /> Sayfa okunuyor…</p>
          ) : waiting.length ? (
            <div className="daily-note-ready">
              <div>
                <strong>{waiting.length} satır karar bekliyor</strong>
                <span>Her satırın kişiye, portföye, talebe veya işe dönüşmesine sen karar verirsin.</span>
              </div>
              <button className="primary-action inline-action" disabled={dirty} onClick={() => { setApplyError(null); setReviewOpen(true); }} type="button">
                <ListChecks size={17} aria-hidden /> Sayfayı işle
              </button>
            </div>
          ) : (
            <p className="content-state"><CheckCheck size={16} aria-hidden /> Bu sayfadaki her satır karara bağlandı.</p>
          )}
          {dirty && waiting.length ? <p className="privacy-hint">Önce değişiklikleri kaydet; satırlar yeniden okunacak.</p> : null}
        </section>
      ) : (
        <section className="daily-note-status" aria-label="Sayfanın durumu">
          <p className="content-state"><NotebookPen size={16} aria-hidden /> Bugün için henüz sayfa yok.</p>
        </section>
      )}

      <p className="daily-note-archive"><Link className="text-button inline-link" href="/">Önceki notlar ve günlük plan</Link></p>

      {reviewOpen && page ? (
        <NotePageReview
          item={page}
          contacts={contacts.data ?? []}
          pending={applyPending}
          error={applyError}
          onClose={() => setReviewOpen(false)}
          onApply={(input) => void apply(input)}
        />
      ) : null}
    </AppShell>
  );
}
