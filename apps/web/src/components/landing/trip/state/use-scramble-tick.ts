import { useEffect, useState } from "react";

const TICK_MS = 70;

export function useScrambleTick(scrambling: boolean): number {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!scrambling) return;

    const timer = setInterval(() => setTick((count) => count + 1), TICK_MS);

    return () => clearInterval(timer);
  }, [scrambling]);

  return scrambling ? tick + 1 : 0;
}
