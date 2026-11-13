"use client";

import { useInView, useMotionTemplate } from "motion/react";
import { useReducedMotion } from "@/components/landing/ui/motion/use-reduced.ts";
import * as m from "motion/react-m";
import { useRef } from "react";
import type { IScene } from "@/components/landing/art/dither/scene.ts";
import { useLean } from "@/components/landing/art/dither/use-lean.ts";
import { useScene } from "@/components/landing/art/dither/use-scene.ts";

interface IDitherCanvas {
  scene: IScene;
  pixel?: number;
  className?: string;
}

const LEAN_PX = 6;

export function DitherCanvas(props: IDitherCanvas) {
  const { scene, pixel = 3, className = "" } = props;
  const ref = useRef<HTMLCanvasElement>(null);
  const inView = useInView(ref);
  const animated = useReducedMotion() !== true;
  const lean = useLean(ref, LEAN_PX, inView && animated);
  const transform = useMotionTemplate`translate3d(${lean.x}px, ${lean.y}px, 0)`;

  useScene(ref, { scene, pixel, running: inView && animated });

  return (
    <div className={`pointer-events-none overflow-hidden ${className}`} aria-hidden="true">
      <m.div className="absolute -inset-2" style={{ transform }}>
        <canvas ref={ref} className="h-full w-full [image-rendering:pixelated]" />
      </m.div>
    </div>
  );
}
