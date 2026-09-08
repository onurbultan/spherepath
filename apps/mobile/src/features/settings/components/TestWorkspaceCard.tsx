import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { testWorkspaceCopy } from "@spherepath/shared";
import { useSession } from "@/features/auth/resources/session";
import { SpCard } from "@/shared/ui/SpCard";
import { SpText } from "@/shared/ui/SpText";
import { SpButton } from "@/shared/ui/SpField";
import { previewTestWorkspaceReset, resetTestWorkspace } from "../resources/test-workspace";
export function TestWorkspaceCard() {
  const { session } = useSession(); const client = useQueryClient(); const [reviewed, setReviewed] = useState(false); const [pending, setPending] = useState(false); const [message, setMessage] = useState("");
  const query = useQuery({ queryKey: ["test-workspace-reset"], queryFn: previewTestWorkspaceReset, enabled: Boolean(session), staleTime: Infinity });
  if (!query.data?.enabled) return null;
  async function reset() { if (!session || !query.data?.snapshotToken) return; setPending(true); try { await resetTestWorkspace(session, query.data.snapshotToken); setReviewed(false); setMessage(testWorkspaceCopy.done); await client.invalidateQueries(); } catch (error) { setReviewed(false); setMessage(error instanceof Error ? error.message : "Test sıfırlanamadı."); } finally { setPending(false); } }
  return <SpCard><SpText variant="title">{testWorkspaceCopy.title}</SpText><SpText>{testWorkspaceCopy.hint}</SpText>{reviewed ? <><SpText>{query.data.total} test kaydı silinecek.</SpText><SpButton disabled={pending || query.data.total === 0} label={testWorkspaceCopy.reset} onPress={() => void reset()} /></> : <SpButton label={testWorkspaceCopy.preview} disabled={query.isFetching} onPress={() => void query.refetch().then(() => setReviewed(true))} />}{message ? <SpText>{message}</SpText> : null}</SpCard>;
}
