import type { ReactNode } from "react";
import { Window } from "@/components/landing/ui/window/window.tsx";

interface IPane {
  area: string;
  title: string;
  status: string;
  tone: "warm" | "cold" | "idle";
  lit?: boolean;
  children: ReactNode;
}

const TONE_CLASS = {
  warm: "border-den-lantern text-den-lantern",
  cold: "border-den-cipher text-den-cipher",
  idle: "border-den-line-strong text-den-muted",
};

export function Pane(props: IPane) {
  const { area, title, status, tone, lit = false, children } = props;

  return (
    <Window
      title={title}
      lit={lit}
      area={area}
      className="z-10"
      badge={
        <span
          className={`border px-1 font-mono text-[10px] leading-4 whitespace-nowrap transition-colors duration-300 ease-out ${TONE_CLASS[tone]}`}
        >
          {status}
        </span>
      }
    >
      <div className="relative flex-1 overflow-hidden px-3 py-2 font-mono text-[11.5px] leading-5 [--den-row:1.25rem] lg:px-4 lg:py-3 lg:text-[12.5px] lg:leading-6 lg:[--den-row:1.5rem]">
        {children}
      </div>
    </Window>
  );
}
