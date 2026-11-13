import { useCallback, useEffect, useState } from "react";
import { TRIP_TIMELINE } from "@/components/landing/trip/state/phases.ts";
import type { TTripPhase } from "@/components/landing/trip/state/phases.ts";

const REDUCED_TIMELINE: typeof TRIP_TIMELINE = [{ phase: "done", at: 0 }];

interface ITripPhase {
  phase: TTripPhase;
  replay: () => void;
}

export function useTripPhase(active: boolean, reduced: boolean): ITripPhase {
  const [phase, setPhase] = useState<TTripPhase>("idle");
  const [run, setRun] = useState(0);

  useEffect(() => {
    if (!active) return;

    const timeline = reduced ? REDUCED_TIMELINE : TRIP_TIMELINE;
    const timers = timeline.map((step) => setTimeout(() => setPhase(step.phase), step.at));

    return () => {
      for (const timer of timers) clearTimeout(timer);
    };
  }, [active, reduced, run]);

  const replay = useCallback(() => {
    setPhase("idle");
    setRun((count) => count + 1);
  }, []);

  return { phase, replay };
}
