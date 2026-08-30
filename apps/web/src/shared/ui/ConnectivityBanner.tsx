"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiQueryKeys } from "@spherepath/shared";
import type { WorkspaceSession } from "@/features/auth/resources/session";
import { captureQueueCount, flushCaptureQueue } from "@/features/interactions/resources/captureQueue";
import { flushInboxQueue, inboxQueueCount } from "@/features/inbox/resources/inbox";

function subscribe(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

export function ConnectivityBanner({ session }: { session: WorkspaceSession | null }) {
  const online = useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
  const [queued, setQueued] = useState(0);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const client = useQueryClient();
  const flushing = useRef(false);

  const invalidateSyncedData = useCallback(async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: apiQueryKeys.inboxItems }),
      client.invalidateQueries({ queryKey: apiQueryKeys.contacts }),
      client.invalidateQueries({ queryKey: apiQueryKeys.opportunities }),
      client.invalidateQueries({ queryKey: apiQueryKeys.todayOverview }),
    ]);
  }, [client]);

  useEffect(() => {
    let active = true;
    const refresh = () => {
      if (!session) { setQueued(0); return; }
      void captureQueueCount(session.uid).then((capture) => {
        if (active) setQueued(capture + inboxQueueCount(session.uid));
      });
    };
    refresh();
    window.addEventListener("spherepath-offline-queue", refresh);
    const onSynced = () => { refresh(); void invalidateSyncedData(); };
    window.addEventListener("spherepath-offline-synced", onSynced);
    return () => {
      active = false;
      window.removeEventListener("spherepath-offline-queue", refresh);
      window.removeEventListener("spherepath-offline-synced", onSynced);
    };
  }, [invalidateSyncedData, session]);

  useEffect(() => {
    if (!online || !session || queued === 0 || flushing.current) return;
    flushing.current = true;
    void Promise.all([flushCaptureQueue(session), flushInboxQueue(session)]).then(async ([capture, inbox]) => {
      setQueued(capture + inbox);
      if (capture + inbox === 0) await invalidateSyncedData();
    }).finally(() => { flushing.current = false; });
  }, [invalidateSyncedData, online, queued, retryAttempt, session]);

  useEffect(() => {
    if (!online || queued === 0) return;
    const timer = window.setTimeout(() => setRetryAttempt((current) => current + 1), 15_000);
    return () => window.clearTimeout(timer);
  }, [online, queued, retryAttempt]);

  if (online && queued === 0) return null;
  return <div className="connectivity-banner" role="status"><span>{online ? `${queued} kayıt gönderilmeyi bekliyor; yeniden deneniyor.` : `Çevrimdışısın. ${queued ? `${queued} kayıt güvenli kuyrukta.` : "Yeni not, temas ve sesli notlar cihazında saklanacak."}`}</span>{online && queued ? <button type="button" onClick={() => setRetryAttempt((current) => current + 1)}>Şimdi dene</button> : null}</div>;
}
