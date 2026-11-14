"use client";

import { useInView } from "motion/react";
import { useReducedMotion } from "@/components/landing/ui/motion/use-reduced.ts";
import { useRef, useState } from "react";
import { DesktopPane } from "@/components/landing/trip/panes/desktop.tsx";
import { LaptopPane } from "@/components/landing/trip/panes/laptop.tsx";
import { ServerPane } from "@/components/landing/trip/panes/server.tsx";
import { useTripLoop } from "@/components/landing/trip/state/use-phase.ts";
import { deriveTripView } from "@/components/landing/trip/state/view.ts";
import { StepRail } from "@/components/landing/trip/steps/rail.tsx";
import { Wire } from "@/components/landing/trip/wire/wire.tsx";

export function TripStage() {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion() === true;
  const visible = useInView(ref, { amount: 0.3 });
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const running = isRunning(visible, hovered, focused);
  const drawn = useInView(ref, { once: true, amount: 0.2 }) || reduced;
  const { phase, beat, durationMs, jump } = useTripLoop(running, reduced);
  const view = deriveTripView(phase);

  return (
    <div
      ref={ref}
      data-playing={running}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        setFocused(event.currentTarget.contains(event.relatedTarget));
      }}
      className="den-dots border-t border-den-line p-3 pb-4 sm:p-6 lg:p-8"
    >
      <div className="den-trip">
        <LaptopPane sealing={view.sealing} lit={view.identical} />
        <Wire
          area="push"
          command="envden push"
          packet={view.pushPacket}
          drawn={drawn}
          working={view.sealing}
        />
        <ServerPane filled={view.serverFilled} />
        <Wire
          area="pull"
          command="envden pull"
          packet={view.pullPacket}
          drawn={drawn}
          working={view.desktopHolds === "ciphertext"}
        />
        <DesktopPane holds={view.desktopHolds} />
      </div>
      <StepRail
        phase={phase}
        beat={beat}
        durationMs={durationMs}
        running={running}
        showAll={reduced}
        onJump={jump}
      />
    </div>
  );
}

function isRunning(visible: boolean, hovered: boolean, focused: boolean): boolean {
  return visible && !hovered && !focused;
}
