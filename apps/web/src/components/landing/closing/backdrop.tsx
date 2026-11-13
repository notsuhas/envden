"use client";

import { denScene } from "@/components/landing/art/den/scene.ts";
import { DitherCanvas } from "@/components/landing/art/dither/canvas.tsx";

export function Backdrop() {
  return <DitherCanvas scene={denScene} className="absolute inset-0" />;
}
