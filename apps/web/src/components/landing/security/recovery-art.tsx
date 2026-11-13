"use client";

import { DitherCanvas } from "@/components/landing/art/dither/canvas.tsx";
import { recoveryScene } from "@/components/landing/art/objects/recovery.ts";

export function RecoveryArt() {
  return (
    <div className="relative h-40 border-t border-den-line">
      <DitherCanvas scene={recoveryScene} className="absolute inset-0" />
      <span className="absolute bottom-2 left-3 font-mono text-[11px] text-den-muted">
        recovery-kit.txt
      </span>
    </div>
  );
}
