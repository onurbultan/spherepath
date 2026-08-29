"use client";

import { useEffect, useState } from "react";
import { ContactWorkspaceView } from "./ContactWorkspaceView";

export function ContactRouteView() {
  const [contactId, setContactId] = useState<string | null>(null);

  useEffect(() => {
    const [, contactsSegment, id] = window.location.pathname.split("/");
    setContactId(contactsSegment === "contacts" && id ? decodeURIComponent(id) : null);
  }, []);

  if (!contactId) return <main className="session-state"><p>Kişi çalışma alanı hazırlanıyor…</p></main>;
  return <ContactWorkspaceView contactId={contactId} />;
}
