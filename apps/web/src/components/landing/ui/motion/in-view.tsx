"use client";

import { useInView } from "motion/react";
import { useRef } from "react";
import type { ReactNode } from "react";

interface IInView {
  children: ReactNode;
  className?: string;
}

export function InView(props: IInView) {
  const { children, className } = props;
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref, { once: true, amount: 0.5 });
  const playing = useInView(ref);

  return (
    <div ref={ref} data-seen={seen} data-playing={playing} className={className}>
      {children}
    </div>
  );
}
