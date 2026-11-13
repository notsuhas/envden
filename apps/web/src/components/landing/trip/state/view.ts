import type { TTripPhase } from "@/components/landing/trip/state/phases.ts";

interface ITripView {
  pushActive: boolean;
  serverFilled: boolean;
  scrambling: boolean;
  pullActive: boolean;
  desktopFilled: boolean;
  done: boolean;
}

const PHASE_ORDER: TTripPhase[] = ["idle", "pushing", "stored", "pulling", "done"];

export function deriveTripView(phase: TTripPhase): ITripView {
  const step = PHASE_ORDER.indexOf(phase);

  return {
    pushActive: phase === "pushing",
    serverFilled: step >= 1,
    scrambling: phase === "pushing",
    pullActive: phase === "pulling",
    desktopFilled: step >= 3,
    done: phase === "done",
  };
}
