"use client";

import { motion } from "motion/react";
import {
  CIPHER_COLUMNS,
  CIPHER_ROWS,
  cipherLine,
} from "@/components/landing/trip/content/cipher.ts";
import { Pane } from "@/components/landing/trip/panes/frame.tsx";
import { useScrambleTick } from "@/components/landing/trip/state/use-scramble-tick.ts";

interface ICipherPane {
  filled: boolean;
  scrambling: boolean;
}

const ROWS = Array.from({ length: CIPHER_ROWS }, (_, row) => row);

export function CipherPane(props: ICipherPane) {
  const { filled, scrambling } = props;
  const tick = useScrambleTick(scrambling);

  return (
    <Pane device="Your server" location="file 9f2c…e41a" footer="Ciphertext and opaque IDs only">
      <motion.div
        aria-hidden="true"
        className="text-den-cipher"
        initial={false}
        animate={{ opacity: filled ? 1 : 0 }}
        transition={{ duration: 0.3 }}
      >
        {ROWS.map((row) => (
          <span key={row} className="block whitespace-pre">
            {cipherLine(CIPHER_COLUMNS, row + tick * CIPHER_ROWS)}
          </span>
        ))}
      </motion.div>
      <span className="sr-only">Encrypted file contents</span>
    </Pane>
  );
}
