"use client";

import { useEffect, useMemo, useRef, useState, type ComponentType, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import {
  BriefcaseBusiness,
  ContactRound,
  House,
  ListTodo,
  MessageSquarePlus,
  Search,
  Settings,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import {
  apiQueryKeys,
  contactRoleLabels,
  listingStatusLabels,
  opportunityStageLabels,
  opportunityTypeLabels,
} from "@spherepath/shared";
import { listContacts } from "@/features/contacts/resources/contacts";
import { listOpportunities } from "@/features/opportunities/resources/opportunities";
import { listListings } from "@/features/listings/resources/listings";
import { useSheetDismiss } from "./useSheetDismiss";

interface PaletteItem {
  id: string;
  group: string;
  title: string;
  subtitle: string;
  href: string;
  icon: ComponentType<{ size?: number }>;
}

const pages: PaletteItem[] = [
  { id: "page-today", group: "Sayfalar", title: "Bugün", subtitle: "Darboğaz teşhisi ve günlük plan", href: "/", icon: ListTodo },
  { id: "page-contacts", group: "Sayfalar", title: "Kişiler", subtitle: "İlişki ağı ve uyum kayıtları", href: "/contacts", icon: ContactRound },
  { id: "page-opportunities", group: "Sayfalar", title: "Fırsatlar", subtitle: "Aşamalar ve sonraki aksiyonlar", href: "/opportunities", icon: BriefcaseBusiness },
  { id: "page-listings", group: "Sayfalar", title: "Portföy", subtitle: "Envanter, ofis havuzu ve kapama", href: "/listings", icon: House },
  { id: "page-capture", group: "Sayfalar", title: "Temas kaydet", subtitle: "Sesli not veya manuel kayıt", href: "/capture", icon: MessageSquarePlus },
  { id: "page-settings", group: "Sayfalar", title: "Ayarlar ve uyum", subtitle: "Profil, ofis ekibi, veri sahibi talepleri", href: "/settings", icon: Settings },
];

const actions: PaletteItem[] = [
  { id: "action-voice", group: "Eylemler", title: "Sesli temas notu başlat", subtitle: "⌘⇧V · görüşme sonrası not", href: "/capture", icon: MessageSquarePlus },
  { id: "action-opportunity", group: "Eylemler", title: "Yeni fırsat oluştur", subtitle: "⌘⇧F · kişi ve sonraki aksiyon", href: "/opportunities?create=1", icon: BriefcaseBusiness },
];

const normalize = (value: string) => value.toLocaleLowerCase("tr-TR");

function matches(item: PaletteItem, query: string): boolean {
  if (!query) return true;
  return normalize(`${item.title} ${item.subtitle}`).includes(query);
}

/** Mounted only while open, so query text and the active row reset on their own. */
function PaletteDialog({ onClose }: { onClose(): void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  useSheetDismiss(true, onClose);

  const contactsQuery = useQuery({ queryKey: apiQueryKeys.contacts, queryFn: listContacts });
  const opportunitiesQuery = useQuery({ queryKey: apiQueryKeys.opportunities, queryFn: listOpportunities });
  const listingsQuery = useQuery({ queryKey: apiQueryKeys.listings, queryFn: listListings });

  const items = useMemo<PaletteItem[]>(() => {
    const normalized = normalize(query.trim());
    const contacts = (contactsQuery.data ?? []).map<PaletteItem>((contact) => ({
      id: `contact-${contact.id}`,
      group: "Kişiler",
      title: contact.fullName ?? contact.label ?? "İsimsiz kişi",
      subtitle: [contactRoleLabels[contact.roles[0] ?? "unknown"], contact.phone].filter(Boolean).join(" · "),
      href: `/contacts/__contact__?contactId=${encodeURIComponent(contact.id)}`,
      icon: ContactRound,
    }));
    const opportunities = (opportunitiesQuery.data ?? []).map<PaletteItem>((opportunity) => ({
      id: `opportunity-${opportunity.id}`,
      group: "Fırsatlar",
      title: opportunity.subjectContactName,
      subtitle: `${opportunityStageLabels[opportunity.stage]} · ${opportunityTypeLabels[opportunity.type]}`,
      href: `/opportunities?opportunityId=${encodeURIComponent(opportunity.id)}`,
      icon: BriefcaseBusiness,
    }));
    const listings = (listingsQuery.data ?? []).map<PaletteItem>((listing) => ({
      id: `listing-${listing.id}`,
      group: "Portföy",
      title: listing.propertySummary.address,
      subtitle: `${listingStatusLabels[listing.status]} · ${listing.ownerContactName}`,
      href: "/listings",
      icon: House,
    }));

    return [
      ...pages.filter((item) => matches(item, normalized)),
      ...contacts.filter((item) => matches(item, normalized)).slice(0, 6),
      ...opportunities.filter((item) => matches(item, normalized)).slice(0, 5),
      ...listings.filter((item) => matches(item, normalized)).slice(0, 5),
      ...actions.filter((item) => matches(item, normalized)),
    ];
  }, [contactsQuery.data, listingsQuery.data, opportunitiesQuery.data, query]);

  function go(item: PaletteItem) {
    onClose();
    router.push(item.href);
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      return setActiveIndex((current) => (items.length ? (current + 1) % items.length : 0));
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      return setActiveIndex((current) => (items.length ? (current - 1 + items.length) % items.length : 0));
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const item = items[activeIndex];
      if (item) go(item);
    }
  }

  useEffect(() => {
    listRef.current?.querySelector(".palette-item.active")?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, items.length]);

  const safeIndex = items.length ? Math.min(activeIndex, items.length - 1) : 0;
  let lastGroup = "";

  return (
    <div
      className="palette-backdrop"
      role="presentation"
      onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}
    >
      <div className="command-palette" role="dialog" aria-modal="true" aria-label="Hızlı arama" onKeyDown={onKeyDown}>
        <div className="palette-search">
          <Search size={17} aria-hidden />
          <input
            autoFocus
            type="search"
            value={query}
            placeholder="Kişi, fırsat veya portföy ara"
            aria-label="Kişi, fırsat veya portföy ara"
            onChange={(event) => { setQuery(event.target.value); setActiveIndex(0); }}
          />
          <span className="topbar-kbd">Esc</span>
        </div>

        <div className="palette-results" ref={listRef}>
          {items.length === 0 ? (
            <p className="palette-empty">Eşleşen kayıt yok. Farklı bir ad, telefon veya adres dene.</p>
          ) : (
            items.map((item, index) => {
              const Icon = item.icon;
              const header = item.group === lastGroup ? null : <span className="palette-group-label">{item.group}</span>;
              lastGroup = item.group;
              return (
                <div key={item.id} style={{ display: "contents" }}>
                  {header}
                  <button
                    type="button"
                    className={index === safeIndex ? "palette-item active" : "palette-item"}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => go(item)}
                  >
                    <span className="palette-icon" aria-hidden><Icon size={14} /></span>
                    <span>
                      <strong>{item.title}</strong>
                      {item.subtitle ? <small>{item.subtitle}</small> : null}
                    </span>
                  </button>
                </div>
              );
            })
          )}
        </div>

        <div className="palette-footer">
          <span><span className="topbar-kbd">↑↓</span> gez</span>
          <span><span className="topbar-kbd">↵</span> aç</span>
          <span><span className="topbar-kbd">Esc</span> kapat</span>
        </div>
      </div>
    </div>
  );
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose(): void }) {
  if (!open) return null;
  return <PaletteDialog onClose={onClose} />;
}
