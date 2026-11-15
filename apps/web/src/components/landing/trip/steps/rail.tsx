"use client";

import { TRIP_STEPS } from "@/components/landing/trip/steps/content.ts";
import type { TTripPhase } from "@/components/landing/trip/state/phases.ts";

interface IStepRail {
  phase: TTripPhase;
  beat: string;
  durationMs: number;
  running: boolean;
  showAll: boolean;
}

export function StepRail(props: IStepRail) {
  const { phase, beat, durationMs, running, showAll } = props;
  const current = TRIP_STEPS.findIndex((step) => step.phase === phase);

  return (
    <div className="mt-3 sm:mt-6">
      <ol className="den-tabs grid grid-cols-5 border border-den-ink bg-den-ground">
        {TRIP_STEPS.map((step, index) => (
          <li key={step.phase} className="border-l border-den-line-strong first:border-l-0">
            <div
              aria-current={index === current ? "step" : undefined}
              className="den-tab relative flex h-11 w-full items-center justify-center gap-2 overflow-hidden font-mono text-[11px] text-den-muted transition-colors duration-150 ease-out aria-[current=step]:text-den-lantern sm:text-xs"
            >
              {index === current && !showAll ? (
                <span
                  key={beat}
                  className="den-step-fill"
                  data-running={running}
                  style={{ animationDuration: `${durationMs}ms` }}
                  aria-hidden="true"
                />
              ) : null}
              <span className="relative hidden tabular-nums opacity-60 sm:inline">{index + 1}</span>
              <span className="relative">{step.label}</span>
            </div>
          </li>
        ))}
      </ol>
      {showAll ? (
        <ol className="mt-3 grid max-w-2xl gap-1.5 text-sm text-den-muted">
          {TRIP_STEPS.map((step) => (
            <li key={step.phase}>
              <span className="text-den-ink">{step.label}.</span> {step.caption}
            </li>
          ))}
        </ol>
      ) : (
        <p
          key={phase}
          className="den-caption mt-3 h-20 max-w-2xl text-sm text-pretty text-den-muted sm:h-14 sm:text-base"
        >
          {TRIP_STEPS[current]?.caption}
        </p>
      )}
    </div>
  );
}
