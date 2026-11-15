import { useEffect, useState } from "react";
import { TRIP_PHASES, nextStep, stepDuration } from "@/components/landing/trip/state/phases.ts";
import type { TTripPhase } from "@/components/landing/trip/state/phases.ts";

interface ITripLoop {
  phase: TTripPhase;
  beat: string;
  durationMs: number;
}

const LAST = TRIP_PHASES.length - 1;

export function useTripLoop(running: boolean, reduced: boolean): ITripLoop {
  const [cursor, setCursor] = useState({ step: 0, turn: 0 });
  const durationMs = stepDuration(cursor.step);

  useEffect(() => {
    if (!running || reduced) return;

    const timer = setTimeout(() => {
      setCursor((current) => ({ step: nextStep(current.step), turn: current.turn + 1 }));
    }, durationMs);

    return () => clearTimeout(timer);
  }, [running, reduced, cursor, durationMs]);

  const step = reduced ? LAST : cursor.step;

  return { phase: TRIP_PHASES[step] ?? "written", beat: String(cursor.turn), durationMs };
}
