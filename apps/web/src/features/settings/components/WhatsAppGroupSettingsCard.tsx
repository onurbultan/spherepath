"use client";

import { useState, type FormEvent } from "react";
import { Check, Copy, ExternalLink, MessageCircleMore, Save } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  apiQueryKeys,
  whatsappGroupConfigurationSchema,
  type WhatsAppGroupConfiguration,
} from "@spherepath/shared";
import { useSession } from "@/features/auth/resources/session";
import { SpCard } from "@/shared/ui/SpCard";
import {
  configureWhatsAppGroupIntegration,
  createWhatsAppOfficeGroup,
  loadWhatsAppGroupIntegration,
} from "../resources/settings";
import { SpInput, SpSelect, SpTextarea } from "@/shared/ui/SpField";

const statusLabels = {
  not_configured: "Kurulum bekliyor",
  configured: "Meta bağlantısı hazır",
  creating: "Grup oluşturuluyor",
  active: "Aktif",
  error: "Kontrol gerekli",
} as const;

const messageFrom = (error: unknown) => error instanceof Error ? error.message : "WhatsApp grup işlemi tamamlanamadı.";
const groupsApiEligibilityUrl = "https://developers.facebook.com/documentation/business-messaging/whatsapp/groups/get-started/";
const isGroupsApiEligibilityError = (message: string | null) => Boolean(message && (message.includes("#131215") || message.includes("not eligible to access Groups APIs")));
const readableMetaError = (message: string | null) => {
  if (!message) return null;
  if (isGroupsApiEligibilityError(message)) {
    return "Meta bu numarayı Groups API için henüz uygun bulmuyor. Groups API yalnız Official Business Account (OBA) numaralarında açılır. İşletme doğrulamasını tamamlayın, numarayı WhatsApp Business Platform'da en az 30 gün kullanın ve WhatsApp Manager'dan OBA başvurusu yapın.";
  }
  return message;
};

export function WhatsAppGroupSettingsCard() {
  const { session } = useSession(); const queryClient = useQueryClient();
  const query = useQuery({ queryKey: apiQueryKeys.whatsappGroupIntegration, queryFn: loadWhatsAppGroupIntegration });
  const [edited, setEdited] = useState<WhatsAppGroupConfiguration | null>(null);
  const [pending, setPending] = useState(false); const [error, setError] = useState<string | null>(null); const [message, setMessage] = useState<string | null>(null); const [copied, setCopied] = useState<"webhook" | "invite" | null>(null);
  if (query.isPending) return <SpCard className="settings-card"><p>WhatsApp grup bağlantısı yükleniyor…</p></SpCard>;
  if (query.error || !query.data) return <SpCard className="settings-card"><p className="form-error">{messageFrom(query.error)}</p></SpCard>;
  const integration = query.data;
  const draft = edited ?? { businessPhoneNumberId: integration.businessPhoneNumberId, subject: integration.subject, description: integration.description, joinApprovalMode: integration.joinApprovalMode };
  const isBroker = session?.role === "broker";

  async function save(event: FormEvent) {
    event.preventDefault(); if (!session || !isBroker) return;
    const parsed = whatsappGroupConfigurationSchema.safeParse(draft); if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Kurulum bilgilerini kontrol edin."); return; }
    setPending(true); setError(null); setMessage(null);
    try { await configureWhatsAppGroupIntegration(session, parsed.data); setEdited(null); await queryClient.invalidateQueries({ queryKey: apiQueryKeys.whatsappGroupIntegration }); setMessage("WhatsApp grup ayarları kaydedildi."); }
    catch (nextError) { setError(messageFrom(nextError)); } finally { setPending(false); }
  }

  async function createGroup() {
    if (!session || !isBroker) return; setPending(true); setError(null); setMessage(null);
    try {
      const next = await createWhatsAppOfficeGroup(session);
      await queryClient.invalidateQueries({ queryKey: apiQueryKeys.whatsappGroupIntegration });
      if (next.status === "error") {
        setError(readableMetaError(next.lastError) ?? "Meta grup oluşturma isteğini reddetti.");
        return;
      }
      if (next.status === "active") setMessage("Meta uyumlu ofis grubu oluşturuldu.");
      else if (next.status === "creating") setMessage("Grup oluşturma isteği Meta'ya iletildi. Sonuç webhook ile güncellenecek.");
      else setError("Grup oluşturma işlemi tamamlanmadı. Meta bağlantısını kontrol edin.");
    }
    catch (nextError) {
      const latest = await loadWhatsAppGroupIntegration().catch(() => null);
      if (latest) queryClient.setQueryData(apiQueryKeys.whatsappGroupIntegration, latest);
      setError(readableMetaError(latest?.lastError ?? null) ?? messageFrom(nextError));
    } finally { setPending(false); }
  }

  async function copy(value: string, type: "webhook" | "invite") {
    try { await navigator.clipboard.writeText(value); setCopied(type); window.setTimeout(() => setCopied(null), 2_000); }
    catch { setError("Bağlantı panoya kopyalanamadı."); }
  }

  return <section className="office-team-section" id="whatsapp-group">
    <div className="section-heading"><div><p className="eyebrow">WHATSAPP GROUPS API</p><h2>Otomatik ofis havuzu</h2><p>Meta API ile yeni bir grup oluşturur; desteklenen grup mesajlarını güvenli biçimde Akış’a taşır.</p></div><span className={integration.status === "active" ? "status-chip success" : "status-chip"}>{statusLabels[integration.status]}</span></div>
    <div className="settings-grid">
      <SpCard className="settings-card">
        <div className="settings-title"><MessageCircleMore size={20} /><div><p className="eyebrow">GRUP KURULUMU</p><h2>Meta bağlantısı</h2></div></div>
        <form className="form-stack" onSubmit={save}>
          <label>Business Phone Number ID<SpInput disabled={!isBroker || integration.status === "active"} inputMode="numeric" placeholder="12784358810" value={draft.businessPhoneNumberId} onChange={(event) => setEdited({ ...draft, businessPhoneNumberId: event.target.value.replace(/\D/gu, "") })} /></label>
          <label>Grup adı<SpInput disabled={!isBroker || integration.status === "active"} maxLength={128} value={draft.subject} onChange={(event) => setEdited({ ...draft, subject: event.target.value })} /></label>
          <label>Açıklama<SpTextarea disabled={!isBroker || integration.status === "active"} maxLength={2048} value={draft.description} onChange={(event) => setEdited({ ...draft, description: event.target.value })} /></label>
          <label>Katılım<SpSelect disabled={!isBroker || integration.status === "active"} value={draft.joinApprovalMode} onChange={(event) => setEdited({ ...draft, joinApprovalMode: event.target.value as WhatsAppGroupConfiguration["joinApprovalMode"] })}><option value="approval_required">Yönetici onayı gerekli</option><option value="auto_approve">Davet bağlantısıyla otomatik katılım</option></SpSelect></label>
          {error ? <p className="form-error">{error}</p> : null}{message ? <p className="form-success">{message}</p> : null}
          {isBroker && integration.status !== "active" ? <div className="inline-actions"><button className="secondary-action inline-action" disabled={pending || !edited} type="submit"><Save size={16} /> Ayarları kaydet</button><button className="primary-action inline-action" disabled={pending || integration.status === "not_configured" || Boolean(edited)} onClick={() => void createGroup()} type="button"><MessageCircleMore size={16} /> Meta grubunu oluştur</button></div> : null}
          {!isBroker ? <p className="privacy-hint">Bu bağlantıyı yalnız ofis brokerı yönetebilir.</p> : null}
        </form>
      </SpCard>
      <SpCard className="settings-card">
        <div className="settings-title"><Check size={20} /><div><p className="eyebrow">WEBHOOK</p><h2>Mesaj alımı</h2></div></div>
        <p className="privacy-copy">Meta uygulamasında <strong>messages</strong>, <strong>group_lifecycle_update</strong>, <strong>group_participants_update</strong>, <strong>group_settings_update</strong> ve <strong>group_status_update</strong> alanlarına abone olun.</p>
        <div className="office-invite-result"><div className="office-invite-code"><span>Callback URL</span><small className="code-value">{integration.webhookUrl}</small></div><button aria-label="Webhook adresini kopyala" className="secondary-action compact-action inline-action" onClick={() => void copy(integration.webhookUrl, "webhook")} type="button">{copied === "webhook" ? <Check size={15} /> : <Copy size={15} />} {copied === "webhook" ? "Kopyalandı" : "Kopyala"}</button></div>
        {integration.groupId ? <div className="privacy-hint"><strong>Grup ID</strong><br /><span className="code-value">{integration.groupId}</span></div> : <p className="privacy-hint">Grup oluşturulduğunda kimlik ve davet bağlantısı burada görünecek.</p>}
        {integration.inviteLink ? <div className="inline-actions"><a className="secondary-action inline-link" href={integration.inviteLink} rel="noreferrer" target="_blank"><ExternalLink size={16} /> Davet bağlantısını aç</a><button className="secondary-action inline-action" onClick={() => void copy(integration.inviteLink!, "invite")} type="button">{copied === "invite" ? <Check size={15} /> : <Copy size={15} />} Kopyala</button></div> : null}
        {integration.lastMessageAt ? <p className="privacy-hint">Son grup mesajı: {new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" }).format(integration.lastMessageAt)}</p> : null}
        {integration.lastError ? <p className="form-error">{readableMetaError(integration.lastError)}</p> : null}
        {isGroupsApiEligibilityError(integration.lastError) ? <a className="secondary-action inline-link" href={groupsApiEligibilityUrl} rel="noreferrer" target="_blank"><ExternalLink size={16} /> Meta uygunluk koşullarını aç</a> : null}
      </SpCard>
    </div>
  </section>;
}
