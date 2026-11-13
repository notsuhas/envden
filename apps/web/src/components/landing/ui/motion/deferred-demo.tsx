"use client";

import dynamic from "next/dynamic";
import { useInView } from "motion/react";
import { useRef } from "react";

const DEMOS = {
  trip: dynamic(
    () => import("@/components/landing/trip/stage.tsx").then((module) => module.TripStage),
    { ssr: false },
  ),
  drift: dynamic(
    () => import("@/components/landing/problem/drift.tsx").then((module) => module.Drift),
    { ssr: false },
  ),
};

interface IDeferredDemo {
  kind: keyof typeof DEMOS;
}

export function DeferredDemo(props: IDeferredDemo) {
  const { kind } = props;
  const ref = useRef<HTMLDivElement>(null);
  const visible = useInView(ref, { once: true, margin: "200px" });
  const Demo = DEMOS[kind];

  return (
    <div ref={ref} className={`den-deferred-${kind}`}>
      {visible ? <Demo /> : null}
    </div>
  );
}
