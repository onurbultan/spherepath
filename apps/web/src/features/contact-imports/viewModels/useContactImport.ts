import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiQueryKeys, selectedImportRowIds, contactImportCopy as copy, type ContactImportRow } from "@spherepath/shared";
import { useSession } from "@/features/auth/resources/session";
import { beginGoogleImport, commitImport, controlImport, finishGoogleImport, getGoogleConfig, getImport, listImports, prepareImport } from "../resources/imports";

export function importError(error: unknown): string {
  return error instanceof Error ? copy.errors[error.message] ?? copy.error : copy.error;
}
export function useContactImport() {
  const { session } = useSession();
  const client = useQueryClient();
  const [jobId, setJobId] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [exclusions, setExclusions] = useState<Record<string, Set<string>>>({});
  const [error, setError] = useState<string | null>(null);
  const jobs = useQuery({ queryKey: [...apiQueryKeys.contactImports, "history", session?.uid], queryFn: listImports, enabled: Boolean(session), refetchInterval: 5000, meta: { persist: false } });
  const google = useQuery({ queryKey: [...apiQueryKeys.contactImports, "google-config"], queryFn: getGoogleConfig, enabled: Boolean(session) });
  const page = useQuery({ queryKey: [...apiQueryKeys.contactImport(jobId ?? ""), cursor, session?.uid], queryFn: () => getImport(jobId!, cursor), enabled: Boolean(session && jobId), refetchInterval: (query) => ["authorizing", "preparing", "processing"].includes(query.state.data?.job.status ?? "") ? 2500 : false, meta: { persist: false } });
  function open(id: string) { setJobId(id); setCursor(null); setError(null); }
  const operation = useMutation({
    mutationFn: async (action: () => Promise<void>) => action(),
    onMutate: () => setError(null),
    onError: (cause) => setError(importError(cause)),
    onSuccess: async () => { await client.invalidateQueries({ queryKey: apiQueryKeys.contactImports }); },
  });
  const progress = page.data?.job.processed;
  useEffect(() => {
    if (progress) {
      void client.invalidateQueries({ queryKey: apiQueryKeys.contacts });
      void client.invalidateQueries({ queryKey: ["contact-import-notes"] });
    }
  }, [client, progress]);
  const selectionKey = `${session?.uid ?? ""}:${jobId ?? ""}`;
  const eligibleRowIds = page.data?.eligibleRowIds ?? [];
  const excluded = exclusions[selectionKey] ?? new Set<string>();
  const selected = new Set(selectedImportRowIds(eligibleRowIds, excluded));
  const excludedCount = (page.data?.job.total ?? 0) - selected.size;
  function updateExclusions(update: (previous: Set<string>) => Set<string>) {
    setExclusions((previous) => ({ ...previous, [selectionKey]: update(previous[selectionKey] ?? new Set()) }));
  }
  const run = (action: () => Promise<void>) => operation.mutate(action);
  return {
    jobs, google, page, jobId, cursor, setCursor, selected, excludedCount, error: error ?? (page.error || jobs.error ? importError(page.error ?? jobs.error) : null), setError, pending: operation.isPending, open,
    eligible: (row: ContactImportRow) => ["new", "matched"].includes(row.status),
    toggle: (id: string) => { if (eligibleRowIds.includes(id)) updateExclusions((previous) => { const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); return next; }); },
    selectAll: () => updateExclusions(() => new Set()),
    excludeAll: () => updateExclusions(() => new Set(eligibleRowIds)),
    prepare: (csv: string, done: () => void) => run(async () => { const result = await prepareImport(session!.uid, csv); open(result.jobId); done(); }),
    commit: () => run(async () => { await commitImport(session!.uid, jobId!, [...selected]); }),
    control: (action: "cancel" | "resume") => run(async () => { await controlImport(session!.uid, jobId!, action); }),
    begin: (navigate: (url: string) => void | Promise<void>) => run(async () => { const result = await beginGoogleImport(session!.uid); open(result.jobId); await navigate(result.authorizationUrl); }),
    finish: (state: string, code: string) => run(async () => { const result = await finishGoogleImport(session!.uid, state, code); open(result.jobId); }),
    refresh: () => { void page.refetch(); void jobs.refetch(); },
  };
}
