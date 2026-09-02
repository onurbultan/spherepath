"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiQueryKeys } from "@spherepath/shared";
import { PhoneCall, RefreshCw } from "lucide-react";
import { useSession } from "@/features/auth/resources/session";
import { SpCard } from "@/shared/ui/SpCard";
import { SpInput } from "@/shared/ui/SpField";
import { loadCallIntegration, configureCallIntegration } from "../resources/settings";
import { loadOfficeTeam } from "../resources/settings";

const messageFrom = (error: unknown) => error instanceof Error ? error.message : "Telefon ayarları güncellenemedi.";
const functionsOrigin = "https://europe-west8-spherepath-96ecd.cloudfunctions.net";

/**
 * The switch needs two addresses and an extension per advisor before a call can
 * reach anyone. None of it is guessable, so it is generated here rather than
 * assembled by hand: the token is unguessable by design, and an advisor without
 * an extension is the commonest reason an inbound call goes nowhere.
 */
export function TelephonySettingsCard() {
  const { session } = useSession();
  const queryClient = useQueryClient();
  const integrationQuery = useQuery({ queryKey: apiQueryKeys.callIntegration, queryFn: loadCallIntegration });
  const teamQuery = useQuery({ queryKey: apiQueryKeys.officeTeam, queryFn: loadOfficeTeam });
  const [extensions, setExtensions] = useState<Record<string, string> | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const integration = integrationQuery.data;
  const members = teamQuery.data?.members ?? [];
  // Stored as extension → advisor; the form reads the other way round.
  const byAdvisor = extensions ?? Object.fromEntries(
    members.map((member) => [member.uid, Object.entries(integration?.extensionOwners ?? {}).find(([, uid]) => uid === member.uid)?.[0] ?? ""]),
  );

  async function save(rotateToken = false) {
    if (!session) return;
    setPending(true); setError(null); setMessage(null);
    try {
      const extensionOwners = Object.fromEntries(
        Object.entries(byAdvisor).filter(([, extension]) => extension.trim()).map(([uid, extension]) => [extension.trim(), uid]),
      );
      await configureCallIntegration(session, { extensionOwners, rotateToken });
      setExtensions(null);
      setMessage(rotateToken ? "Yeni webhook adresi üretildi; Verimor panelindeki adresi güncelleyin." : "Telefon ayarları kaydedildi.");
      await queryClient.invalidateQueries({ queryKey: apiQueryKeys.callIntegration });
    } catch (cause) {
      setError(messageFrom(cause));
    } finally {
      setPending(false);
    }
  }

  const webhook = (name: string) =>
    integration ? `${functionsOrigin}/${name}?integration=${integration.integrationId}&token=${integration.webhookToken}` : "";

  return (
    <SpCard className="settings-card" id="telephony">
      <div className="settings-title">
        <PhoneCall size={20} />
        <div>
          <p className="eyebrow">TELEFON</p>
          <h2>Santral bağlantısı</h2>
        </div>
      </div>
      <p className="privacy-copy">
        Gelen çağrı, arayan numaranın kayıtlı olduğu danışmana yönlendirilir. Bunun için her
        danışmanın santraldeki dahili numarası burada eşlenir.
      </p>

      {integrationQuery.isPending ? (
        <p className="privacy-copy"><RefreshCw className="spin" size={15} /> Bağlantı yükleniyor…</p>
      ) : (
        <>
          {members.map((member) => (
            <label key={member.uid}>
              {member.displayName} · dahili
              <SpInput
                inputMode="numeric"
                onChange={(event) => setExtensions({ ...byAdvisor, [member.uid]: event.target.value })}
                placeholder="1001"
                value={byAdvisor[member.uid] ?? ""}
              />
            </label>
          ))}

          {integration ? (
            <>
              {/* These belong in the switch's own panel, which is not this device. */}
              <label>Olay bildirimi adresi<SpInput readOnly value={webhook("verimorCallWebhook")} /></label>
              <label>Yönlendirme adresi<SpInput readOnly value={webhook("verimorRoutingWebhook")} /></label>
              <p className="privacy-hint">Bu iki adresi Verimor panelindeki CRM entegrasyonu bölümüne yazın.</p>
            </>
          ) : (
            <p className="privacy-hint">Kaydettiğinizde webhook adresleri üretilecek.</p>
          )}

          {error ? <p className="form-error" role="alert">{error}</p> : null}
          {message ? <p className="privacy-hint">{message}</p> : null}
          <div className="inline-actions">
            <button className="secondary-action inline-action" disabled={pending || !session} onClick={() => void save()} type="button">
              Kaydet
            </button>
            {integration ? (
              <button className="secondary-action inline-action" disabled={pending} onClick={() => void save(true)} type="button">
                Adresi yenile
              </button>
            ) : null}
          </div>
        </>
      )}
    </SpCard>
  );
}
