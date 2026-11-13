"use client";

import { finaleScene } from "@/components/landing/art/objects/finale.ts";
import { DitherCanvas } from "@/components/landing/art/dither/canvas.tsx";

export function Backdrop() {
  return <DitherCanvas scene={finaleScene} className="absolute inset-0" />;
}
