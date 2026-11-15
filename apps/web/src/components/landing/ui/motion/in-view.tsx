"use client";

import { useInView, useReducedMotion } from "motion/react";
import { useRef, useState } from "react";
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
  const reduced = useReducedMotion() === true;
  const [replaying, setReplaying] = useState(false);

  return (
    <div
      ref={ref}
      data-seen={reduced || (seen && !replaying)}
      data-entered={seen}
      onMouseEnter={() => {
        if (!reduced) setReplaying(true);
      }}
      onMouseLeave={() => setReplaying(false)}
      data-playing={playing}
      className={className}
    >
      {children}
    </div>
  );
}
