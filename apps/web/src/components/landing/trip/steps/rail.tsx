import { TRIP_STEPS } from "@/components/landing/trip/steps/content.ts";
import type { TTripPhase } from "@/components/landing/trip/state/phases.ts";

interface IStepRail {
  phase: TTripPhase;
  beat: string;
  durationMs: number;
  running: boolean;
  showAll: boolean;
  onJump: (phase: TTripPhase) => void;
}

export function StepRail(props: IStepRail) {
  const { phase, beat, durationMs, running, showAll, onJump } = props;
  const current = TRIP_STEPS.findIndex((step) => step.phase === phase);

  return (
    <div className="mt-3 sm:mt-6">
      <ol className="grid grid-cols-5 border border-den-ink bg-den-ground">
        {TRIP_STEPS.map((step, index) => (
          <li key={step.phase} className="border-l border-den-line-strong first:border-l-0">
            <button
              type="button"
              onClick={() => onJump(step.phase)}
              aria-current={index === current ? "step" : undefined}
              className="relative flex h-9 w-full items-center justify-center gap-2 overflow-hidden font-mono text-[11px] text-den-muted -outline-offset-2 transition-[color,background-color] duration-150 ease-out hover:bg-den-surface hover:text-den-ink active:bg-den-raised aria-[current=step]:text-den-lantern sm:text-xs"
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
            </button>
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
        <p className="mt-3 h-20 max-w-2xl text-sm text-pretty text-den-muted sm:h-14 sm:text-base">
          {TRIP_STEPS[current]?.caption}
        </p>
      )}
    </div>
  );
}
