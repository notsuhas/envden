import { useEffect, useState } from "react";

const TICK_MS = 55;

// counts up while running and wraps at total, so a session loops
export function useTicks(
  total: number,
  running: boolean,
  intervalMs = TICK_MS,
  externalTick?: number,
): number {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!running || externalTick !== undefined) return;

    const timer = setInterval(() => setTick((current) => (current + 1) % total), intervalMs);

    return () => clearInterval(timer);
  }, [total, running, intervalMs, externalTick]);

  return externalTick ?? tick;
}
