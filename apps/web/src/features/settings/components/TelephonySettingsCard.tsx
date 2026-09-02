"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiQueryKeys } from "@spherepath/shared";
import { PhoneCall, RefreshCw } from "lucide-react";
import { useSession } from "@/features/auth/resources/session";
import { SpCard } from "@/shared/ui/SpCard";
import { SpInput } from "@/shared/ui/SpField";
import { loadCallIntegration, configureCallIntegration, connectCallProvider } from "../resources/settings";
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
  const [connected, setConnected] = useState<boolean | null>(null);

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
      if (rotateToken) setConnected(null);
      setMessage(rotateToken ? "Yeni webhook adresi üretildi; Verimor panelindeki adresi güncelleyin." : "Telefon ayarları kaydedildi.");
      await queryClient.invalidateQueries({ queryKey: apiQueryKeys.callIntegration });
    } catch (cause) {
      setError(messageFrom(cause));
    } finally {
      setPending(false);
    }
  }

  /**
   * The switch's own API takes the event address, so it never has to be copied
   * by hand. The routing address has no such endpoint and still goes in the panel.
   */
  async function connect() {
    if (!session) return;
    setPending(true); setError(null); setMessage(null);
    try {
      const state = await connectCallProvider(session);
      setConnected(state.connected);
      setMessage(state.connected
        ? "Verimor bu adrese bağlandı; çağrı olayları buraya düşecek."
        : `Verimor farklı bir adres tutuyor: ${state.notificationUrl ?? "tanımsız"}`);
    } catch (cause) {
      setConnected(false);
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
              {/* The switch takes this one over its API; the field is here for diagnosis. */}
              <label>Olay bildirimi adresi<SpInput readOnly value={webhook("verimorCallWebhook")} /></label>
              <p className="privacy-hint">
                {connected === true
                  ? "Verimor bu adrese bağlı."
                  : "\u201cVerimor\u2019a bağlan\u201d bu adresi santrala kendisi yazar; elle kopyalamanız gerekmez."}
              </p>
              {/* No API sets this one, so it does have to be pasted into the panel. */}
              <label>Yönlendirme adresi<SpInput readOnly value={webhook("verimorRoutingWebhook")} /></label>
              <p className="privacy-hint">Bu adresi Verimor panelinde numaranın yönlendirme (advisory webhook) alanına yazın.</p>
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
              <>
                <button className="secondary-action inline-action" disabled={pending} onClick={() => void connect()} type="button">
                  Verimor&apos;a bağlan
                </button>
                <button className="secondary-action inline-action" disabled={pending} onClick={() => void save(true)} type="button">
                  Adresi yenile
                </button>
              </>
            ) : null}
          </div>
        </>
      )}
    </SpCard>
  );
}
