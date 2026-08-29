"use client";

import { useCallback, useSyncExternalStore } from "react";
import { themeStorageKey, type ThemePreference } from "./theme-bootstrap";

export type { ThemePreference };

const listeners = new Set<() => void>();

function isPreference(value: unknown): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

function subscribe(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  window.addEventListener("storage", onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
    window.removeEventListener("storage", onStoreChange);
  };
}

function getSnapshot(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(themeStorageKey);
    return isPreference(stored) ? stored : "system";
  } catch {
    return "system";
  }
}

/** The server cannot know the stored choice; `system` matches the pre-paint script. */
const getServerSnapshot = (): ThemePreference => "system";

export function useThemePreference(): [ThemePreference, (next: ThemePreference) => void] {
  const preference = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const update = useCallback((next: ThemePreference) => {
    if (next === "system") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", next);
    try {
      if (next === "system") window.localStorage.removeItem(themeStorageKey);
      else window.localStorage.setItem(themeStorageKey, next);
    } catch {
      // A blocked storage API only costs persistence; the attribute is already set.
    }
    for (const listener of listeners) listener();
  }, []);

  return [preference, update];
}
