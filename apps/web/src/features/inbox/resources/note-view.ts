"use client";

import { useCallback, useSyncExternalStore } from "react";

export const noteViewModes = [
  { id: "card", label: "Kart" },
  { id: "list", label: "Liste" },
  { id: "group", label: "Grup" },
] as const;

export type NoteViewMode = (typeof noteViewModes)[number]["id"];

const noteViewStorageKey = "spherepath.note-view.v1";
const listeners = new Set<() => void>();

function isMode(value: unknown): value is NoteViewMode {
  return noteViewModes.some((mode) => mode.id === value);
}

function subscribe(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  window.addEventListener("storage", onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
    window.removeEventListener("storage", onStoreChange);
  };
}

function getSnapshot(): NoteViewMode {
  try {
    const stored = window.localStorage.getItem(noteViewStorageKey);
    return isMode(stored) ? stored : "card";
  } catch {
    return "card";
  }
}

/** The server cannot know the stored choice; cards are the default either way. */
const getServerSnapshot = (): NoteViewMode => "card";

/**
 * Which layout the advisor reads their notes in. It is a per-person reading
 * preference rather than workspace data, so it stays in the browser.
 */
export function useNoteViewMode(): [NoteViewMode, (next: NoteViewMode) => void] {
  const mode = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const update = useCallback((next: NoteViewMode) => {
    try {
      window.localStorage.setItem(noteViewStorageKey, next);
    } catch {
      // A blocked storage API only costs persistence between visits.
    }
    for (const listener of listeners) listener();
  }, []);

  return [mode, update];
}
