"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Building2, Check, Copy, UserPlus, Users } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiQueryKeys, type OfficeInviteView } from "@spherepath/shared";
import { useSession } from "@/features/auth/resources/session";
import { SpCard } from "@/shared/ui/SpCard";
import { createOfficeInvite, joinOffice, loadOfficeTeam, revokeOfficeInvite } from "../resources/settings";

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : "Ekip bilgileri güncellenemedi.";
}

export function OfficeTeamPanel() {
  const { session, refreshSession } = useSession();
  const router = useRouter();
  const queryClient = useQueryClient();
  const teamQuery = useQuery({ queryKey: apiQueryKeys.officeTeam, queryFn: loadOfficeTeam });
  const [invite, setInvite] = useState<OfficeInviteView | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [inviteCopied, setInviteCopied] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function createInvite() {
    if (!session) return;
    setPending(true); setError(null); setMessage(null);
    try {
      const nextInvite = await createOfficeInvite(session);
      setInvite(nextInvite);
      await refreshSession();
      await queryClient.invalidateQueries({ queryKey: apiQueryKeys.officeTeam });
      setMessage("Tek kullanımlık ofis daveti hazırlandı.");
    } catch (nextError) { setError(messageFrom(nextError)); }
    finally { setPending(false); }
  }

  async function copyInvite() {
    if (!invite) return;
    try {
      await navigator.clipboard.writeText(invite.code);
      setInviteCopied(true);
      window.setTimeout(() => setInviteCopied(false), 2500);
    } catch { setError("Davet kodu panoya kopyalanamadı."); }
  }

  async function revokeInvite(code: string) {
    if (!session) return;
    setPending(true); setError(null); setMessage(null);
    try {
      await revokeOfficeInvite(session, code);
      if (invite?.code === code) setInvite(null);
      await queryClient.invalidateQueries({ queryKey: apiQueryKeys.officeTeam });
      setMessage("Ofis daveti iptal edildi.");
    } catch (nextError) { setError(messageFrom(nextError)); }
    finally { setPending(false); }
  }

  async function joinTeam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) return;
    setPending(true); setError(null); setMessage(null);
    try {
      await joinOffice(session, { code: joinCode });
      await refreshSession();
      queryClient.clear();
      router.push("/");
    } catch (nextError) { setError(messageFrom(nextError)); setPending(false); }
  }

  return <>
    {message ? <p className="success-notice">{message}</p> : null}
    {error ? <p className="form-error notice">{error}</p> : null}
    <section className="office-team-section"><div className="section-heading"><div><p className="eyebrow">OFİS EKİBİ</p><h2>Ortak çalışma alanı</h2><p>Kişiler danışmana ait kalır; broker ofis genelini, danışman kendi kayıtlarını görür. Ortak portföy havuzu bütün ekibe açıktır.</p></div></div><div className="settings-grid">
      <SpCard className="settings-card office-team-card"><div className="settings-title"><Users size={20} /><div><p className="eyebrow">{teamQuery.data?.officeName ?? "OFİS"}</p><h2>Ekip üyeleri</h2></div></div>{teamQuery.isPending ? <p>Ofis ekibi yükleniyor…</p> : teamQuery.error ? <p className="form-error">{messageFrom(teamQuery.error)}</p> : <div className="office-member-list">{teamQuery.data?.members.map((member) => <div className="office-member" key={member.uid}><span className="contact-avatar">{member.displayName.slice(0, 1).toLocaleUpperCase("tr-TR")}</span><div><strong>{member.displayName}</strong><small>{member.role === "broker" ? "Broker / ofis yöneticisi" : "Gayrimenkul danışmanı"}</small></div></div>)}</div>}{teamQuery.data?.canInvite ? <button className="secondary-action inline-action" disabled={pending} onClick={() => void createInvite()} type="button"><UserPlus size={17} /> Davet kodu oluştur</button> : null}{invite ? <div className="office-invite-result"><div className="office-invite-code"><span>7 gün geçerli · tek kullanımlık</span><strong>{invite.code}</strong></div><div className="office-invite-actions"><button className="secondary-action compact-action inline-action" onClick={() => void copyInvite()} type="button">{inviteCopied ? <Check size={15} aria-hidden /> : <Copy size={15} aria-hidden />} {inviteCopied ? "Kopyalandı" : "Kodu kopyala"}</button><button className="secondary-action danger-secondary compact-action inline-action" disabled={pending} onClick={() => void revokeInvite(invite.code)} type="button">İptal et</button></div></div> : null}{teamQuery.data?.activeInvites.filter((item) => item.code !== invite?.code).map((item) => <div className="office-invite-result" key={item.code}><div className="office-invite-code"><span>{new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" }).format(item.expiresAt)} tarihine kadar geçerli</span><strong>{item.code}</strong></div><div className="office-invite-actions"><button className="secondary-action danger-secondary compact-action inline-action" disabled={pending} onClick={() => void revokeInvite(item.code)} type="button">İptal et</button></div></div>)}</SpCard>
      {teamQuery.data?.canJoinOffice ? <SpCard className="settings-card"><div className="settings-title"><Building2 size={20} /><div><p className="eyebrow">DAVETLE KATIL</p><h2>Başka bir ofise katıl</h2></div></div><p className="privacy-copy">Bu boş kişisel çalışma alanını, size verilen tek kullanımlık kodla ofis ekibine bağlayabilirsiniz.</p><form className="form-stack" onSubmit={joinTeam}><label>Ofis davet kodu<input autoCapitalize="characters" maxLength={8} value={joinCode} onChange={(event) => setJoinCode(event.target.value.toLocaleUpperCase("tr-TR").replace(/[^A-Z2-9]/gu, ""))} placeholder="ABCD2345" /></label><button className="secondary-action inline-action" disabled={pending || joinCode.length !== 8} type="submit"><Building2 size={17} /> Ofise katıl</button></form></SpCard> : <SpCard className="settings-card"><div className="settings-title"><Building2 size={20} /><div><p className="eyebrow">AKTİF ÇALIŞMA ALANI</p><h2>Ofis bağlantısı korunuyor</h2></div></div><p className="privacy-copy">Bu hesapta aktif kayıtlar bulunduğu için başka bir ofise doğrudan geçiş kapalıdır. Böylece kişi, fırsat ve görevler yanlışlıkla geride bırakılmaz.</p></SpCard>}
    </div></section>
  </>;
}
