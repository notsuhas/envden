"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";

interface IReveal {
  children: ReactNode;
  className?: string;
  delay?: number;
}

const EASE_OUT = [0.2, 0.7, 0.2, 1] as const;

export function Reveal(props: IReveal) {
  const { children, className, delay = 0 } = props;

  return (
    <motion.div
      data-reveal
      className={className}
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.5, ease: EASE_OUT, delay }}
    >
      {children}
    </motion.div>
  );
}
