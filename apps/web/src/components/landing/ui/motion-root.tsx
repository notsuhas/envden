"use client";

import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";

interface IMotionRoot {
  children: ReactNode;
}

export function MotionRoot(props: IMotionRoot) {
  const { children } = props;

  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
