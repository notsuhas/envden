const BAYER_4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

export function bayerThreshold(x: number, y: number): number {
  return ((BAYER_4[(y & 3) * 4 + (x & 3)] ?? 0) + 0.5) / 16;
}
