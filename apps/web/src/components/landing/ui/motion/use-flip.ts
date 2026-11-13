import { useEffect, useState } from "react";

// flips between false and true on a timer while running, and rests on true otherwise
export function useFlip(running: boolean, offMs: number, onMs: number): boolean {
  const [on, setOn] = useState(false);

  useEffect(() => {
    if (!running) return;

    const timer = setTimeout(() => setOn((current) => !current), on ? onMs : offMs);

    return () => clearTimeout(timer);
  }, [running, on, offMs, onMs]);

  return on;
}
