import * as m from "motion/react-m";
import type { MotionValue } from "motion/react";
import type { TPacket } from "@/components/landing/trip/state/view.ts";

interface IWire {
  area: string;
  command: string;
  packet: TPacket;
  draw: MotionValue<number>;
  working: boolean;
}

const PLUG_CLASS = "absolute h-2 w-2 border border-den-ink bg-den-ground";

export function Wire(props: IWire) {
  const { area, command, packet, draw, working } = props;

  return (
    <div
      className="den-cable relative flex h-9 items-center justify-center lg:h-20 lg:w-32 xl:w-40"
      data-cable={area}
      data-live={packet === "sent"}
      style={{ gridArea: area }}
    >
      <m.span
        className="den-cable-line absolute inset-y-0 left-1/2 w-[5px] -translate-x-1/2 border-x lg:inset-x-0 lg:inset-y-auto lg:top-1/2 lg:left-0 lg:h-[5px] lg:w-auto lg:translate-x-0 lg:-translate-y-1/2 lg:border-x-0 lg:border-y"
        style={{ scale: draw }}
        aria-hidden="true"
      />
      <span
        className={`${PLUG_CLASS} top-0 left-1/2 -translate-x-1/2 lg:top-1/2 lg:left-0 lg:-translate-y-1/2 lg:translate-x-0`}
        aria-hidden="true"
      />
      <span
        className={`${PLUG_CLASS} bottom-0 left-1/2 -translate-x-1/2 lg:top-1/2 lg:right-0 lg:bottom-auto lg:left-auto lg:-translate-y-1/2 lg:translate-x-0`}
        aria-hidden="true"
      />
      <span className="den-packet" data-packet={packet} aria-hidden="true">
        <span className="absolute top-1/2 left-0 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 bg-den-lantern" />
      </span>
      <code className="den-cable-label relative z-10 flex items-center gap-2 border border-den-ink bg-den-ground px-2 py-0.5 font-mono text-[11px] whitespace-nowrap text-den-ink lg:-translate-y-7">
        <span className="relative h-2.5 w-2 overflow-hidden" aria-hidden="true">
          <span
            className="den-press absolute inset-x-0 top-0 h-1.5 bg-den-lantern"
            data-working={working}
          />
        </span>
        {command}
      </code>
    </div>
  );
}
