"use client";

import dynamic from "next/dynamic";
import { useInView } from "motion/react";
import { useRef } from "react";

const Mesh = dynamic(
  () => import("@/components/landing/yours/mesh.tsx").then((module) => module.Mesh),
  { ssr: false },
);

const Backdrop = dynamic(
  () => import("@/components/landing/closing/backdrop.tsx").then((module) => module.Backdrop),
  { ssr: false },
);

interface IDeferredArt {
  kind: "mesh" | "backdrop";
}

export function DeferredArt(props: IDeferredArt) {
  const { kind } = props;
  const ref = useRef<HTMLDivElement>(null);
  const visible = useInView(ref, { once: true, margin: "200px" });

  return (
    <div ref={ref} className="pointer-events-none absolute inset-0">
      {visible ? kind === "mesh" ? <Mesh /> : <Backdrop /> : null}
    </div>
  );
}
