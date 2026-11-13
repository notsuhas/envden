"use client";

import { useReducedMotion } from "@/components/landing/ui/motion/use-reduced.ts";
import * as m from "motion/react-m";
import type { ReactNode } from "react";

interface IReveal {
  children: ReactNode;
  className?: string;
  delay?: number;
}

const EASE_OUT = [0.23, 1, 0.32, 1] as const;

export function Reveal(props: IReveal) {
  const { children, className, delay = 0 } = props;
  const offset = useReducedMotion() === true ? 0 : 12;

  return (
    <m.div
      data-reveal
      className={className}
      initial={{ opacity: 0, transform: `translateY(${offset}px)` }}
      whileInView={{ opacity: 1, transform: "translateY(0px)" }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.45, ease: EASE_OUT, delay }}
    >
      {children}
    </m.div>
  );
}
