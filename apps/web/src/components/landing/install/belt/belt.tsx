"use client";

import { DitherCanvas } from "@/components/landing/art/dither/canvas.tsx";
import { pressScene } from "@/components/landing/art/press/scene.ts";

// the conveyor between the cells: a press seals an envelope, and the belt carries it across
export function Belt() {
  return (
    <div
      className="relative hidden h-14 items-end border-y border-den-line bg-den-ground sm:flex"
      aria-hidden="true"
    >
      <div className="relative h-full w-20 shrink-0 border-r border-den-line">
        <DitherCanvas scene={pressScene} className="absolute inset-0" />
      </div>
      <div className="relative h-full flex-1 overflow-hidden">
        <span className="den-belt absolute inset-x-0 bottom-2 h-1.5" />
        <span className="den-parcel absolute inset-0">
          <span className="absolute bottom-[14px] left-0 flex h-5 w-8 items-center justify-center border border-den-ink bg-den-ground font-mono text-[9px] text-den-lantern">
            .env
          </span>
        </span>
      </div>
      <span className="flex h-full w-20 shrink-0 items-center justify-center border-l border-den-line font-mono text-[10px] text-den-muted">
        sealed
      </span>
    </div>
  );
}
