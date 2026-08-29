"use client";

import { useEffect, useState } from "react";

/**
 * Tracks which anchored section is currently in view so an in-page side
 * navigation can highlight it. Falls back to the first id until the observer
 * has seen anything, which is what a freshly loaded page shows.
 */
export function useActiveAnchor(ids: readonly string[], topOffset = 96, ready = true): string {
  const [active, setActive] = useState(ids[0] ?? "");

  useEffect(() => {
    if (!ready) return;
    const targets = ids
      .map((id) => document.getElementById(id))
      .filter((node): node is HTMLElement => node !== null);
    if (!targets.length) return;

    let frame = 0;
    const measure = () => {
      frame = 0;
      const marker = topOffset + 1;
      let next = targets[0]?.id ?? "";

      for (const target of targets) {
        if (target.getBoundingClientRect().top > marker) break;
        next = target.id;
      }

      const atDocumentEnd = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2;
      if (atDocumentEnd) next = targets.at(-1)?.id ?? next;
      setActive((current) => current === next ? current : next);
    };
    const scheduleMeasure = () => {
      if (!frame) frame = window.requestAnimationFrame(measure);
    };
    const syncHash = () => {
      const hashId = decodeURIComponent(window.location.hash.slice(1));
      const hashTarget = targets.find((target) => target.id === hashId);
      if (hashTarget) {
        hashTarget.scrollIntoView();
        setActive((current) => current === hashId ? current : hashId);
      }
      scheduleMeasure();
    };

    window.addEventListener("scroll", scheduleMeasure, { passive: true });
    window.addEventListener("resize", scheduleMeasure);
    window.addEventListener("hashchange", syncHash);
    if (window.location.hash) {
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        syncHash();
      });
    } else {
      scheduleMeasure();
    }

    return () => {
      window.removeEventListener("scroll", scheduleMeasure);
      window.removeEventListener("resize", scheduleMeasure);
      window.removeEventListener("hashchange", syncHash);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [ids, ready, topOffset]);

  return active;
}
