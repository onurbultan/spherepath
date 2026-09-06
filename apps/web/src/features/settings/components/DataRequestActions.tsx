"use client";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiQueryKeys, dataRequestCopy, type Contact, type DataSubjectRequestView, type ResolveDataSubjectRequestInput } from "@spherepath/shared";
import { useSession } from "@/features/auth/resources/session";
import { resolveDataSubjectRequest } from "../resources/settings";
import { SpInput, SpTextarea } from "@/shared/ui/SpField";
import { PhoneField } from "@/shared/ui/MaskedFields";
export function DataRequestActions({ item, contact, exportData }: { item: DataSubjectRequestView; contact?: Contact; exportData(): Promise<void> }) {
  const { session } = useSession(); const client = useQueryClient();
  const [note, setNote] = useState(""); const [delivered, setDelivered] = useState(false);
  const [name, setName] = useState(contact?.fullName ?? ""); const [phone, setPhone] = useState(contact?.phone ?? "");
  const [pending, setPending] = useState(false); const [error, setError] = useState<string | null>(null);
  async function resolve(decision: ResolveDataSubjectRequestInput["decision"]) {
    if (!session) return; setPending(true); setError(null);
    try {
      if (decision === "prepared") await exportData();
      await resolveDataSubjectRequest(session, { requestId: item.id, decision,
        resolutionNote: decision === "prepared" ? "Veri kopyası hazırlandı; teslim bekliyor." : note,
        correctedContact: decision === "approved" && item.type === "correction" && contact ? { fullName: name, phone, metAtPlace: contact.metAtPlace ?? "", source: contact.source, role: contact.roles[0] ?? "unknown" } : null,
      });
      await Promise.all([client.invalidateQueries({ queryKey: apiQueryKeys.dataSubjectRequests }), client.invalidateQueries({ queryKey: apiQueryKeys.contacts })]);
      setNote("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Talep güncellenemedi."); }
    finally { setPending(false); }
  }

  return <div className="form-stack">
    {item.status === "pending_verification" ? <><label>{dataRequestCopy.verification}<SpTextarea value={note} onChange={(event) => setNote(event.target.value)} /></label>{item.type === "correction" ? <><label>Düzeltilmiş ad soyad<SpInput value={name} onChange={(event) => setName(event.target.value)} /></label><label>Düzeltilmiş telefon<PhoneField value={phone} onChange={setPhone} /></label></> : null}<button disabled={pending || note.trim().length < 8} type="button" onClick={() => void resolve("approved")}>{dataRequestCopy.verify}</button><button disabled={pending || note.trim().length < 8} type="button" onClick={() => void resolve("rejected")}>Reddet</button></> : null}
    {item.type === "access" && item.status === "approved" ? <button disabled={pending} type="button" onClick={() => void resolve("prepared")}>{pending ? "Veri kopyası hazırlanıyor…" : dataRequestCopy.prepare}</button> : null}
    {item.type === "access" && item.status === "processing" ? <><p role="status">{dataRequestCopy.awaitingDelivery}</p><label>{dataRequestCopy.deliveryNote}<SpTextarea value={note} onChange={(event) => setNote(event.target.value)} /></label><label className="check-label"><SpInput type="checkbox" checked={delivered} onChange={(event) => setDelivered(event.target.checked)} />{dataRequestCopy.delivery}</label><button disabled={pending || !delivered || note.trim().length < 8} type="button" onClick={() => void resolve("completed")}>{dataRequestCopy.complete}</button></> : null}
    {item.type === "access" && (item.status === "processing" || item.status === "completed") ? <button disabled={pending} type="button" onClick={() => void exportData().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "İndirme başarısız."))}>Veri kopyasını indir</button> : null}
    {error ? <p className="form-error" role="alert">{error}</p> : null}
  </div>;
}
