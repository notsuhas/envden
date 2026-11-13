"use client";

import { useInView, useReducedMotion, useScroll, useTransform } from "motion/react";
import { useRef } from "react";
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
  const running = useInView(ref, { amount: 0.3 });
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 0.9", "end 0.6"] });
  const pushDraw = useTransform(scrollYProgress, [0, 0.3], [reduced ? 1 : 0, 1]);
  const pullDraw = useTransform(scrollYProgress, [0.3, 0.6], [reduced ? 1 : 0, 1]);
  const { phase, beat, durationMs, jump } = useTripLoop(running, reduced);
  const view = deriveTripView(phase);

  return (
    <div
      ref={ref}
      data-playing={running}
      className="den-dots border-t border-den-line p-3 pb-4 sm:p-6 lg:p-10"
    >
      <div className="den-trip">
        <LaptopPane sealing={view.sealing} lit={view.identical} />
        <Wire
          area="push"
          command="envden push"
          packet={view.pushPacket}
          draw={pushDraw}
          working={view.sealing}
        />
        <ServerPane filled={view.serverFilled} />
        <Wire
          area="pull"
          command="envden pull"
          packet={view.pullPacket}
          draw={pullDraw}
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
