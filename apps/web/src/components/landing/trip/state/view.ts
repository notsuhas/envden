import { TRIP_PHASES } from "@/components/landing/trip/state/phases.ts";
import type { TTripPhase } from "@/components/landing/trip/state/phases.ts";

export type TPacket = "waiting" | "ready" | "sent";

interface ITripView {
  sealing: boolean;
  pushPacket: TPacket;
  serverFilled: boolean;
  pullPacket: TPacket;
  desktopHolds: "nothing" | "ciphertext" | "file";
  identical: boolean;
}

const DESKTOP_HOLDS = { pulled: "ciphertext", opened: "file" } as const;

function packetAt(step: number, readyStep: number): TPacket {
  if (step < readyStep) return "waiting";

  return step === readyStep ? "ready" : "sent";
}

export function deriveTripView(phase: TTripPhase): ITripView {
  const step = TRIP_PHASES.indexOf(phase);

  return {
    sealing: phase === "sealed",
    pushPacket: packetAt(step, 1),
    serverFilled: step >= 2,
    pullPacket: packetAt(step, 2),
    desktopHolds: phase === "pulled" || phase === "opened" ? DESKTOP_HOLDS[phase] : "nothing",
    identical: phase === "opened",
  };
}
