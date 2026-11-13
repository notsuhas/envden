"use client";

import { motion } from "motion/react";
import { EnvLine } from "@/components/landing/trip/panes/env-line.tsx";
import { Pane } from "@/components/landing/trip/panes/frame.tsx";
import { ENV_LINES } from "@/components/landing/trip/content/env-lines.ts";

interface IFilePane {
  device: string;
  location: string;
  footer: string;
  filled: boolean;
}

const LINE_STAGGER = 0.09;

export function FilePane(props: IFilePane) {
  const { device, location, footer, filled } = props;

  return (
    <Pane device={device} location={location} footer={footer}>
      <ol aria-hidden={!filled}>
        {ENV_LINES.map((line, index) => (
          <motion.li
            key={line.number}
            className="flex gap-3 whitespace-pre"
            initial={false}
            animate={{ opacity: filled ? 1 : 0, x: filled ? 0 : -6 }}
            transition={{ duration: 0.25, delay: filled ? index * LINE_STAGGER : 0 }}
          >
            <span className="w-4 shrink-0 select-none text-right text-den-muted/60">
              {line.number}
            </span>
            <EnvLine text={line.text} />
          </motion.li>
        ))}
      </ol>
    </Pane>
  );
}
