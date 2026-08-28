"use client";

import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, ContactRound, Pencil, Plus, RefreshCw, X } from "lucide-react";
import {
  apiQueryKeys,
  contactDraftSchema,
  contactRoleLabels,
  contactRoles,
  contactSourceLabels,
  contactSources,
  type ContactDraft,
} from "@spherepath/shared";
import { AppShell } from "@/shared/ui/AppShell";
import { SpCard } from "@/shared/ui/SpCard";
import { useSession } from "@/features/auth/resources/session";
import { archiveContact, listContacts, saveContact, type ContactRecord } from "../resources/contacts";

const emptyDraft: ContactDraft = {
  fullName: "",
  phone: "",
  metAtPlace: "",
  source: "in_person",
  role: "unknown",
};

function contactDraft(contact: ContactRecord): ContactDraft {
  return {
    fullName: contact.fullName ?? contact.label ?? "",
    phone: contact.phone ?? "",
    metAtPlace: contact.metAtPlace ?? "",
    source: contact.source,
    role: contact.roles[0] ?? "unknown",
  };
}

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : "İşlem tamamlanamadı.";
}

export function ContactsView() {
  const { session } = useSession();
  const queryClient = useQueryClient();
  const [panelOpen, setPanelOpen] = useState(false);
  const [editing, setEditing] = useState<ContactRecord | null>(null);
  const [draft, setDraft] = useState<ContactDraft>(emptyDraft);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const contactsQuery = useQuery({
    queryKey: apiQueryKeys.contacts,
    queryFn: listContacts,
    enabled: Boolean(session),
  });
  const contacts = contactsQuery.data ?? [];

  function openCreate() {
    setEditing(null);
    setDraft(emptyDraft);
    setError(null);
    setPanelOpen(true);
  }

  function openEdit(contact: ContactRecord) {
    setEditing(contact);
    setDraft(contactDraft(contact));
    setError(null);
    setPanelOpen(true);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) return;
    const parsed = contactDraftSchema.safeParse(draft);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Kişi bilgilerini kontrol et.");
      return;
    }

    setPending(true);
    try {
      await saveContact(session, parsed.data, editing ?? undefined);
      setPanelOpen(false);
      setEditing(null);
      setDraft(emptyDraft);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: apiQueryKeys.contacts }),
        queryClient.invalidateQueries({ queryKey: apiQueryKeys.todayOverview }),
      ]);
    } catch (nextError) {
      setError(messageFrom(nextError));
    } finally {
      setPending(false);
    }
  }

  async function remove(contact: ContactRecord) {
    if (!window.confirm(`${contact.fullName ?? "Bu kişi"} arşivlensin mi?`)) return;
    try {
      if (!session) return;
      await archiveContact(session, contact.id);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: apiQueryKeys.contacts }),
        queryClient.invalidateQueries({ queryKey: apiQueryKeys.todayOverview }),
      ]);
    } catch (nextError) {
      setError(messageFrom(nextError));
    }
  }

  return (
    <AppShell>
      <header className="page-header contacts-header">
        <div><p className="eyebrow">İLİŞKİ AĞI</p><h1>Kişiler</h1><p className="context-sentence">Tanıştığın kişileri, kaynağını ve sıradaki ilişki adımını tek yerde tut.</p></div>
        <button className="primary-action inline-action" type="button" onClick={openCreate}><Plus size={18} aria-hidden /> Yeni kişi</button>
      </header>

      {(error ?? (contactsQuery.error ? messageFrom(contactsQuery.error) : null)) && !panelOpen ? <p className="form-error notice" role="alert">{error ?? messageFrom(contactsQuery.error)}</p> : null}
      {contactsQuery.isPending ? (
        <div className="content-state"><RefreshCw className="spin" size={22} aria-hidden /> Kişiler yükleniyor…</div>
      ) : contacts.length === 0 ? (
        <SpCard className="empty-state"><div className="card-icon secondary"><ContactRound size={20} aria-hidden /></div><h2>İlk kişini ekle</h2><p>Ad veya tanımlayıcı, tanışma kaynağı ve rol başlangıç için yeterli.</p><button className="secondary-action" type="button" onClick={openCreate}>Kişi oluştur</button></SpCard>
      ) : (
        <section className="contact-grid" aria-label="Kişiler">
          {contacts.map((contact) => (
            <SpCard key={contact.id} className="contact-card">
              <div className="contact-avatar">{(contact.fullName ?? contact.label ?? "?").slice(0, 1).toLocaleUpperCase("tr-TR")}</div>
              <div className="contact-summary"><h2>{contact.fullName ?? contact.label}</h2><p>{contact.phone ?? "Telefon eklenmedi"}</p></div>
              <div className="contact-meta"><span>{contactRoleLabels[contact.roles[0] ?? "unknown"]}</span><span>{contactSourceLabels[contact.source]}</span></div>
              <p className="contact-place">{contact.metAtPlace || "Tanışma yeri belirtilmedi"}</p>
              <div className="card-actions"><button type="button" onClick={() => openEdit(contact)}><Pencil size={16} aria-hidden /> Düzenle</button><button type="button" onClick={() => void remove(contact)}><Archive size={16} aria-hidden /> Arşivle</button></div>
            </SpCard>
          ))}
        </section>
      )}

      {panelOpen ? (
        <div className="sheet-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setPanelOpen(false); }}>
          <section className="form-sheet" role="dialog" aria-modal="true" aria-labelledby="contact-form-title">
            <div className="sheet-heading"><div><p className="eyebrow">HIZLI KAYIT</p><h2 id="contact-form-title">{editing ? "Kişiyi düzenle" : "Yeni kişi"}</h2></div><button className="icon-action" aria-label="Kapat" type="button" onClick={() => setPanelOpen(false)}><X size={20} /></button></div>
            <form className="form-stack" onSubmit={submit}>
              <label>Ad, soyad veya tanımlayıcı<input autoFocus value={draft.fullName} onChange={(event) => setDraft({ ...draft, fullName: event.target.value })} required /></label>
              <label>Telefon <span className="optional">isteğe bağlı</span><input inputMode="tel" value={draft.phone} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} /></label>
              <label>Tanışma yeri <span className="optional">isteğe bağlı</span><input value={draft.metAtPlace} onChange={(event) => setDraft({ ...draft, metAtPlace: event.target.value })} placeholder="Örn. Marina açık ev etkinliği" /></label>
              <div className="form-row">
                <label>Kaynak<select value={draft.source} onChange={(event) => setDraft({ ...draft, source: event.target.value as ContactDraft["source"] })}>{contactSources.map((source) => <option key={source} value={source}>{contactSourceLabels[source]}</option>)}</select></label>
                <label>Rol<select value={draft.role} onChange={(event) => setDraft({ ...draft, role: event.target.value as ContactDraft["role"] })}>{contactRoles.map((role) => <option key={role} value={role}>{contactRoleLabels[role]}</option>)}</select></label>
              </div>
              {error ? <p className="form-error" role="alert">{error}</p> : null}
              <button className="primary-action auth-submit" disabled={pending} type="submit">{pending ? "Kaydediliyor…" : editing ? "Değişiklikleri kaydet" : "Kişiyi kaydet"}</button>
            </form>
          </section>
        </div>
      ) : null}
    </AppShell>
  );
}
