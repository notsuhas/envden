import { useMotionValue, useSpring } from "motion/react";
import type { MotionValue } from "motion/react";
import { useEffect } from "react";
import type { RefObject } from "react";

const SPRING = { visualDuration: 0.6, bounce: 0.15 };

interface ILean {
  x: MotionValue<number>;
  y: MotionValue<number>;
}

// how far the art leans toward the pointer, in pixels, while it is over the section
export function useLean(ref: RefObject<HTMLElement | null>, reach: number, active: boolean): ILean {
  const targetX = useMotionValue(0);
  const targetY = useMotionValue(0);
  const x = useSpring(targetX, SPRING);
  const y = useSpring(targetY, SPRING);

  useEffect(() => {
    const zone = ref.current?.closest("section");
    if (!zone || !active) return;

    const aim = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;

      const box = zone.getBoundingClientRect();
      targetX.set((((event.clientX - box.left) / box.width) * 2 - 1) * reach);
      targetY.set((((event.clientY - box.top) / box.height) * 2 - 1) * reach);
    };

    const rest = () => {
      targetX.set(0);
      targetY.set(0);
    };

    zone.addEventListener("pointermove", aim, { passive: true });
    zone.addEventListener("pointerleave", rest, { passive: true });

    return () => {
      zone.removeEventListener("pointermove", aim);
      zone.removeEventListener("pointerleave", rest);
    };
  }, [ref, reach, active, targetX, targetY]);

  return { x, y };
}
