"use client";

import { useInView, useReducedMotion } from "motion/react";
import { useRef } from "react";
import { useTicks } from "@/components/landing/ui/typed/use-ticks.ts";
import { Window } from "@/components/landing/ui/window/window.tsx";

const CODE = "3-K7QF-2MXP";
const TOTAL = 72;

export function PairPreview() {
  const ref = useRef<HTMLDivElement>(null);
  const visible = useInView(ref);
  const reduced = useReducedMotion() === true;
  const tick = useTicks(TOTAL, visible && !reduced, 55);
  const count = reduced ? CODE.length : Math.min(CODE.length, Math.floor((tick * 55) / 180));

  return (
    <div ref={ref} className="grid grid-cols-2 gap-3 font-mono text-[11.5px]">
      {["laptop", "new laptop"].map((name, index) => (
        <Window key={name} title={name} lit={count === CODE.length}>
          <p className="p-3 text-den-muted">
            pairing code
            <span className="mt-1 block min-h-5 text-sm text-den-lantern tracking-wider">
              {index === 0 ? CODE : CODE.slice(0, count)}
            </span>
          </p>
        </Window>
      ))}
    </div>
  );
}
