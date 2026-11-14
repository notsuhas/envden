"use client";

import { useInView } from "motion/react";
import { useReducedMotion } from "@/components/landing/ui/motion/use-reduced.ts";
import { useRef } from "react";
import { sessionFrame, sessionTicks } from "@/components/landing/ui/typed/frame.ts";
import type { ISessionLine } from "@/components/landing/ui/typed/frame.ts";
import { useTicks } from "@/components/landing/ui/typed/use-ticks.ts";

interface ITypedSession {
  lines: ISessionLine[];
  className?: string;
  sharedTick?: number;
}

const LINE_CLASS = {
  command: "text-den-ink",
  prompt: "text-den-lantern",
  answer: "text-den-ink",
  output: "text-den-muted",
  pause: "",
};

const LEAD = { command: "$ ", prompt: "◆ ", answer: "│ ", output: "", pause: "" };

function visible(lines: ISessionLine[]): ISessionLine[] {
  return lines.filter((line) => line.kind !== "pause");
}

export function TypedSession(props: ITypedSession) {
  const { lines, className = "", sharedTick } = props;
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.4 });
  const reduced = useReducedMotion() === true;
  const total = sessionTicks(lines);
  const tick = useTicks(total, inView && !reduced, 55, sharedTick);
  const frame = reduced ? { lines, typing: false } : sessionFrame(lines, tick);
  const shown = visible(frame.lines);

  return (
    <div ref={ref} className={`font-mono text-[12px] leading-[1.55] ${className}`}>
      <p className="sr-only">
        {visible(lines)
          .map((line) => line.text)
          .join(". ")}
      </p>
      <div className="relative">
        <div aria-hidden="true" className="invisible">
          {visible(lines).map((line, index) => (
            <p key={index} className="min-h-[1.55em] break-words whitespace-pre-wrap">
              <span>{LEAD[line.kind]}</span>
              {line.text || "\u00a0"}
              <span className="ml-0.5 inline-block w-1.5" />
            </p>
          ))}
        </div>
        <div aria-hidden="true" className="absolute inset-0">
          {shown.map((line, index) => (
            <p
              key={index}
              className={`min-h-[1.55em] break-words whitespace-pre-wrap ${LINE_CLASS[line.kind]}`}
            >
              <span className="text-den-muted select-none">{LEAD[line.kind]}</span>
              {line.text}
              {index === shown.length - 1 ? (
                <span
                  key={line.text.length}
                  className="den-caret ml-0.5 inline-block h-3 w-1.5 translate-y-0.5 bg-den-lantern"
                />
              ) : null}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}
