"use client";

import { DitherCanvas } from "@/components/landing/art/dither/canvas.tsx";
import { meshScene } from "@/components/landing/art/mesh/scene.ts";

export function Mesh() {
  return <DitherCanvas scene={meshScene} className="absolute inset-0" />;
}
