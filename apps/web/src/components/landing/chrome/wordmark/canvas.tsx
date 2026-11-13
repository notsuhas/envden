"use client";

import { useInView, useReducedMotion } from "motion/react";
import { useRef } from "react";
import { useWordmark } from "@/components/landing/chrome/wordmark/use-wordmark.ts";

export function WordmarkCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);
  const inView = useInView(ref);
  const animated = useReducedMotion() !== true;

  useWordmark(ref, inView && animated);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none block aspect-[35/11.9] w-full font-mono"
    />
  );
}
