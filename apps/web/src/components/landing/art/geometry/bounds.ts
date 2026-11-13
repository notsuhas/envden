export function between(value: number, low: number, high: number): boolean {
  return value >= low && value <= high;
}

export function inside(
  x: number,
  y: number,
  left: number,
  top: number,
  right: number,
  bottom: number,
): boolean {
  return between(x, left, right) && between(y, top, bottom);
}
