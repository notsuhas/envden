"use client";

import { useInView, useReducedMotion } from "motion/react";
import { useRef } from "react";
import { DRIFT_MACHINES } from "@/components/landing/problem/machines.ts";
import { DriftLine } from "@/components/landing/problem/line.tsx";
import { useFlip } from "@/components/landing/ui/motion/use-flip.ts";
import { Window } from "@/components/landing/ui/window/window.tsx";

const BADGE_CLASS = "border px-1 font-mono text-[10px] leading-4 whitespace-nowrap";

export function Drift() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.4 });
  const reduced = useReducedMotion() === true;
  const flipped = useFlip(inView && !reduced, 2600, 3400);
  const synced = reduced || flipped;

  return (
    <div
      ref={ref}
      className="den-dots grid gap-3 border-t border-den-line p-3 sm:grid-cols-3 sm:p-6 lg:gap-6 lg:p-10"
    >
      {DRIFT_MACHINES.map((machine) => (
        <Window
          key={machine.name}
          title={machine.name}
          lit={synced}
          badge={
            <span
              className={`${BADGE_CLASS} ${synced ? "border-den-lantern text-den-lantern" : "border-den-cipher text-den-cipher"}`}
            >
              {synced ? "identical" : "differs"}
            </span>
          }
        >
          <ol className="px-3 py-2 font-mono text-[11.5px] leading-5 lg:px-4 lg:py-3 lg:text-[12.5px] lg:leading-6">
            {machine.lines.map((line) => (
              <DriftLine key={line.same} line={line} synced={synced} />
            ))}
          </ol>
        </Window>
      ))}
    </div>
  );
}
