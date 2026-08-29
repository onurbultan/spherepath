"use client";

import { useParams, useSearchParams } from "next/navigation";
import { ContactWorkspaceView } from "./ContactWorkspaceView";

export function ContactRouteView() {
  const params = useParams<{ id?: string }>();
  const search = useSearchParams();
  const routeId = params.id && params.id !== "__contact__" ? decodeURIComponent(params.id) : null;
  const contactId = search.get("contactId") ?? routeId;

  if (!contactId) return <main className="session-state"><p>Kişi çalışma alanı hazırlanıyor…</p></main>;
  return <ContactWorkspaceView contactId={contactId} />;
}
