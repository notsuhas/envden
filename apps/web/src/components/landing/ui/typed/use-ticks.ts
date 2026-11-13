import { useEffect, useState } from "react";

const TICK_MS = 55;

// counts up while running and wraps at total, so a session loops
export function useTicks(total: number, running: boolean): number {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!running) return;

    const timer = setInterval(() => setTick((current) => (current + 1) % total), TICK_MS);

    return () => clearInterval(timer);
  }, [total, running]);

  return tick;
}
