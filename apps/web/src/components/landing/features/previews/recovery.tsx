"use client";

import { DitherCanvas } from "@/components/landing/art/dither/canvas.tsx";
import { recoveryScene } from "@/components/landing/art/objects/recovery.ts";
import { Window } from "@/components/landing/ui/window/window.tsx";

export function RecoveryPreview() {
  return (
    <Window title="recovery-kit.txt">
      <div className="relative h-40">
        <DitherCanvas scene={recoveryScene} className="absolute inset-0" />
      </div>
    </Window>
  );
}
