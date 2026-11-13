export const TRIP_PHASES = ["written", "sealed", "stored", "pulled", "opened"] as const;

export type TTripPhase = (typeof TRIP_PHASES)[number];

const STEP_MS: Record<TTripPhase, number> = {
  written: 1600,
  sealed: 1800,
  stored: 2200,
  pulled: 1900,
  opened: 3200,
};

const PICKED_HOLD_MS = 2600;

// a step the reader picked stays up a little longer before the loop moves on
export function stepDuration(step: number, picked: boolean): number {
  const phase = TRIP_PHASES[step] ?? "written";

  return STEP_MS[phase] + (picked ? PICKED_HOLD_MS : 0);
}

export function nextStep(step: number): number {
  return (step + 1) % TRIP_PHASES.length;
}
