"use client";

import { useInView } from "motion/react";
import { useRef } from "react";
import { AGENT_SESSION, USER_SESSION } from "@/components/landing/agents/sessions.ts";
import { useReducedMotion } from "@/components/landing/ui/motion/use-reduced.ts";
import { sessionTicks } from "@/components/landing/ui/typed/frame.ts";
import { TypedSession } from "@/components/landing/ui/typed/session.tsx";
import { useTicks } from "@/components/landing/ui/typed/use-ticks.ts";
import { Window } from "@/components/landing/ui/window/window.tsx";

const TOTAL = Math.max(sessionTicks(AGENT_SESSION), sessionTicks(USER_SESSION));

export function AgentsDemo() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.4 });
  const reduced = useReducedMotion() === true;
  const tick = useTicks(TOTAL, inView && !reduced);

  return (
    <div
      ref={ref}
      className="den-dots grid gap-3 border-t border-den-line p-3 sm:p-6 lg:grid-cols-2 lg:gap-6 lg:p-8"
    >
      <Window title="agent · ~/code/shop">
        <TypedSession lines={AGENT_SESSION} sharedTick={tick} className="min-h-32 p-3" />
      </Window>
      <Window title="your terminal">
        <TypedSession lines={USER_SESSION} sharedTick={tick} className="min-h-32 p-3" />
      </Window>
    </div>
  );
}
