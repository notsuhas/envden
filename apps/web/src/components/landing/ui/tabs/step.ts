const STEP: Record<string, number> = {
  ArrowRight: 1,
  ArrowDown: 1,
  ArrowLeft: -1,
  ArrowUp: -1,
};

export function stepTab(current: number, key: string, count: number): number {
  if (key === "Home") return 0;
  if (key === "End") return count - 1;

  return (current + (STEP[key] ?? 0) + count) % count;
}
