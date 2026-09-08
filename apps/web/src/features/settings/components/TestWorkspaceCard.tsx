"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { testWorkspaceCopy } from "@spherepath/shared";
import { useSession } from "@/features/auth/resources/session";
import { SpCard } from "@/shared/ui/SpCard";
import { previewTestWorkspaceReset, resetTestWorkspace } from "../resources/test-workspace";
export function TestWorkspaceCard() {
  const { session } = useSession(); const client = useQueryClient(); const [reviewed, setReviewed] = useState(false); const [pending, setPending] = useState(false); const [message, setMessage] = useState("");
  const query = useQuery({ queryKey: ["test-workspace-reset"], queryFn: previewTestWorkspaceReset, enabled: Boolean(session), staleTime: Infinity });
  if (!query.data?.enabled) return null;
  async function reset() { if (!session || !query.data?.snapshotToken) return; setPending(true); try { await resetTestWorkspace(session, query.data.snapshotToken); setReviewed(false); setMessage(testWorkspaceCopy.done); await client.invalidateQueries(); } catch (error) { setReviewed(false); setMessage(error instanceof Error ? error.message : "Test sıfırlanamadı."); } finally { setPending(false); } }
  return <SpCard><h2>{testWorkspaceCopy.title}</h2><p>{testWorkspaceCopy.hint}</p>{reviewed ? <><p>{query.data.total} test kaydı silinecek.</p><button className="secondary-action" disabled={pending || query.data.total === 0} type="button" onClick={() => void reset()}>{testWorkspaceCopy.reset}</button></> : <button className="secondary-action" type="button" disabled={query.isFetching} onClick={() => void query.refetch().then(() => setReviewed(true))}>{testWorkspaceCopy.preview}</button>}{message ? <p role="status">{message}</p> : null}</SpCard>;
}
