"use client";

import { useInView, useReducedMotion } from "motion/react";
import { useRef } from "react";
import { CipherPane } from "@/components/landing/trip/panes/cipher.tsx";
import { FilePane } from "@/components/landing/trip/panes/file.tsx";
import { TripStep } from "@/components/landing/trip/step.tsx";
import { deriveTripView } from "@/components/landing/trip/state/view.ts";
import { useTripPhase } from "@/components/landing/trip/state/use-phase.ts";

export function TripStage() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.3 });
  const reduced = useReducedMotion() === true;
  const { phase, replay } = useTripPhase(inView, reduced);
  const view = deriveTripView(phase);

  return (
    <div ref={ref}>
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)] xl:items-center xl:gap-4">
        <FilePane device="Laptop" location="~/code/shop/.env" footer="What you wrote" filled />
        <TripStep command="envden push" active={view.pushActive} />
        <CipherPane filled={view.serverFilled} scrambling={view.scrambling} />
        <TripStep command="envden pull" active={view.pullActive} />
        <FilePane
          device="Desktop"
          location="~/work/shop/.env"
          footer={view.done ? "Identical, byte for byte" : "Waiting for a pull"}
          filled={view.desktopFilled}
        />
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-sm text-den-muted">
          Comments, order and blank lines arrive exactly as you wrote them. The server in the middle
          only ever holds ciphertext.
        </p>
        <button
          type="button"
          onClick={replay}
          disabled={!view.done}
          className="rounded-full border border-den-line px-3 py-1 text-xs text-den-muted transition-opacity hover:text-den-ink disabled:opacity-0"
        >
          Replay
        </button>
      </div>
    </div>
  );
}
