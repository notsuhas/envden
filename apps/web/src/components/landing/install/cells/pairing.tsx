"use client";

import { useInView } from "motion/react";
import { useReducedMotion } from "@/components/landing/ui/motion/use-reduced.ts";
import { useRef } from "react";
import { APPROVER_SESSION, JOINER_SESSION } from "@/components/landing/install/sessions.ts";
import { sessionTicks } from "@/components/landing/ui/typed/frame.ts";
import { TypedSession } from "@/components/landing/ui/typed/session.tsx";
import { useTicks } from "@/components/landing/ui/typed/use-ticks.ts";
import { Window } from "@/components/landing/ui/window/window.tsx";

const TOTAL = Math.max(sessionTicks(APPROVER_SESSION), sessionTicks(JOINER_SESSION));

export function PairingCell() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref);
  const reduced = useReducedMotion() === true;
  const tick = useTicks(TOTAL, inView && !reduced);

  return (
    <div ref={ref} className="grid gap-3 xl:grid-cols-2">
      <Window title="laptop">
        <TypedSession lines={APPROVER_SESSION} sharedTick={tick} className="min-h-40 p-3" />
      </Window>
      <Window title="desktop">
        <TypedSession lines={JOINER_SESSION} sharedTick={tick} className="min-h-40 p-3" />
      </Window>
    </div>
  );
}
