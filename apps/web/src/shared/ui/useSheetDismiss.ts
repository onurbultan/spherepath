"use client";

import { useEffect, useRef } from "react";

/**
 * Shared behaviour for the side sheets: Escape closes, the page behind stops
 * scrolling, and focus returns to whatever opened the sheet.
 *
 * The callback is kept in a ref so an inline arrow at the call site does not
 * re-run the effect on every render and re-lock the scroll position.
 */
export function useSheetDismiss(open: boolean, onDismiss: () => void): void {
  const dismiss = useRef(onDismiss);
  useEffect(() => {
    dismiss.current = onDismiss;
  });

  useEffect(() => {
    if (!open) return;
    const restoreTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      dismiss.current();
    }
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (restoreTo && document.body.contains(restoreTo)) restoreTo.focus();
    };
  }, [open]);
}
