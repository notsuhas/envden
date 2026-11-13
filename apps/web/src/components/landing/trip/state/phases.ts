export type TTripPhase = "idle" | "pushing" | "stored" | "pulling" | "done";

export const TRIP_TIMELINE: { phase: TTripPhase; at: number }[] = [
  { phase: "pushing", at: 700 },
  { phase: "stored", at: 2100 },
  { phase: "pulling", at: 2700 },
  { phase: "done", at: 3900 },
];
