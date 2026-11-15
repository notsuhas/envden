export const TRIP_PHASES = ["written", "sealed", "stored", "pulled", "opened"] as const;

export type TTripPhase = (typeof TRIP_PHASES)[number];

const STEP_MS: Record<TTripPhase, number> = {
  written: 1600,
  sealed: 1800,
  stored: 2200,
  pulled: 1900,
  opened: 3200,
};

export function stepDuration(step: number): number {
  return STEP_MS[TRIP_PHASES[step] ?? "written"];
}

export function nextStep(step: number): number {
  return (step + 1) % TRIP_PHASES.length;
}
