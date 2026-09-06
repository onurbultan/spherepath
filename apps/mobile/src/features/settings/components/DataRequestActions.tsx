import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiQueryKeys, dataRequestCopy, type Contact, type DataSubjectRequestView, type ResolveDataSubjectRequestInput } from "@spherepath/shared";
import { useSession } from "@/features/auth/resources/session";
import { resolveDataSubjectRequest } from "../resources/settings";
import { Pressable, TextInput, View } from "react-native";
import { SpText } from "@/shared/ui/SpText";
import { PhoneInput } from "@/shared/ui/MaskedInputs";
import { controlMetrics } from "@/shared/ui/SpField";
import { useSpTheme } from "@/shared/ui/theme";
import { space } from "@/shared/ui/tokens.generated";
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

  const theme = useSpTheme(); const inputStyle = { ...controlMetrics, color: theme.textPrimary, borderColor: theme.line, backgroundColor: theme.background };
  return <View style={{ gap: space.md }}>
    {item.status === "pending_verification" ? <><SpText>{dataRequestCopy.verification}</SpText><TextInput accessibilityLabel={dataRequestCopy.verification} style={inputStyle} value={note} onChangeText={setNote} />{item.type === "correction" ? <><SpText>Düzeltilmiş ad soyad</SpText><TextInput accessibilityLabel="Düzeltilmiş ad soyad" style={inputStyle} value={name} onChangeText={setName} /><SpText>Düzeltilmiş telefon</SpText><PhoneInput style={inputStyle} value={phone} onChangeText={setPhone} /></> : null}<Pressable disabled={pending || note.trim().length < 8} onPress={() => void resolve("approved")}><SpText color="deed">{dataRequestCopy.verify}</SpText></Pressable><Pressable disabled={pending || note.trim().length < 8} onPress={() => void resolve("rejected")}><SpText color="ask">Reddet</SpText></Pressable></> : null}
    {item.type === "access" && item.status === "approved" ? <Pressable disabled={pending} onPress={() => void resolve("prepared")}><SpText color="deed">{pending ? "Veri kopyası hazırlanıyor…" : dataRequestCopy.prepare}</SpText></Pressable> : null}
    {item.type === "access" && item.status === "processing" ? <><SpText>{dataRequestCopy.awaitingDelivery}</SpText><SpText>{dataRequestCopy.deliveryNote}</SpText><TextInput accessibilityLabel={dataRequestCopy.deliveryNote} style={inputStyle} value={note} onChangeText={setNote} /><Pressable accessibilityRole="checkbox" accessibilityState={{ checked: delivered }} onPress={() => setDelivered(!delivered)}><SpText>{delivered ? "✓ " : ""}{dataRequestCopy.delivery}</SpText></Pressable><Pressable disabled={pending || !delivered || note.trim().length < 8} onPress={() => void resolve("completed")}><SpText color="deed">{dataRequestCopy.complete}</SpText></Pressable></> : null}
    {item.type === "access" && (item.status === "processing" || item.status === "completed") ? <Pressable disabled={pending} onPress={() => void exportData().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Paylaşım başarısız."))}><SpText color="deed">Veri kopyasını paylaş</SpText></Pressable> : null}
    {error ? <SpText color="ask">{error}</SpText> : null}
  </View>;
}
