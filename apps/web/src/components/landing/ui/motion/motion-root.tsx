"use client";

import { LazyMotion, MotionConfig, domAnimation } from "motion/react";
import type { ReactNode } from "react";

interface IMotionRoot {
  children: ReactNode;
}

export function MotionRoot(props: IMotionRoot) {
  const { children } = props;

  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}
