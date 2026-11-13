import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(change: () => void): () => void {
  const media = matchMedia(QUERY);
  media.addEventListener("change", change);

  return () => media.removeEventListener("change", change);
}

function snapshot(): boolean {
  return matchMedia(QUERY).matches;
}

function serverSnapshot(): boolean {
  return false;
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}
