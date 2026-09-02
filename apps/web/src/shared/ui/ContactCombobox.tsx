"use client";

import { Search, X } from "lucide-react";
import { useId, useMemo, useRef, useState } from "react";

export interface ContactChoice {
  id: string;
  fullName: string | null;
  label: string | null;
  relationship?: { lastTouchAt: number | null };
}

function contactName(contact: ContactChoice): string {
  return contact.fullName ?? contact.label ?? "İsimsiz kişi";
}

export function ContactCombobox({ contacts, value, onChange, label = "Kişi", placeholder = "Kişi ara ve seç", required = true }: { contacts: readonly ContactChoice[]; value: string; onChange(value: string): void; label?: string; placeholder?: string; required?: boolean }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selected = contacts.find((contact) => contact.id === value) ?? null;
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const visible = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("tr-TR");
    const ranked = [...contacts].sort((left, right) => (right.relationship?.lastTouchAt ?? 0) - (left.relationship?.lastTouchAt ?? 0));
    return (normalized ? ranked.filter((contact) => contactName(contact).toLocaleLowerCase("tr-TR").includes(normalized)) : ranked).slice(0, normalized ? 12 : 5);
  }, [contacts, query]);

  return <label className="sp-field contact-combobox-label"><span className="sp-field-label">{label}</span><div className="sp-control is-composite contact-combobox" ref={rootRef} onBlur={(event) => { if (!rootRef.current?.contains(event.relatedTarget as Node | null)) setOpen(false); }}>
    <Search size={16} aria-hidden />
    <input className="sp-control-inner contact-combobox-input" aria-autocomplete="list" aria-controls={listId} aria-expanded={open} aria-label={`${label} ara`} placeholder={selected ? "" : placeholder} required={required && !value} role="combobox" value={query} onChange={(event) => { setQuery(event.target.value); setOpen(true); if (selected) onChange(""); }} onFocus={() => setOpen(true)} />
    {value ? <button aria-label="Kişi seçimini temizle" className="contact-combobox-clear" type="button" onClick={() => { onChange(""); setQuery(""); setOpen(true); }}><X size={14} /></button> : null}
    {selected && !query ? <strong className="contact-combobox-value">{contactName(selected)}</strong> : null}
    {open ? <div className="contact-combobox-list" id={listId} role="listbox">
      {!query ? <small>Son görüşülen kişiler</small> : null}
      {visible.map((contact) => <button aria-selected={contact.id === value} key={contact.id} role="option" type="button" onClick={() => { onChange(contact.id); setQuery(""); setOpen(false); }}>{contactName(contact)}</button>)}
      {visible.length === 0 ? <em>Eşleşen kişi bulunamadı.</em> : null}
    </div> : null}
  </div></label>;
}
