import { inside } from "@/components/landing/art/geometry/bounds.ts";
import { stack, SKIP } from "@/components/landing/art/dither/scene.ts";
import type { IScene } from "@/components/landing/art/dither/scene.ts";

function lock(x: number, y: number): number {
  if (inside(x, y, -29, -1, -11, 11)) return inside(x, y, -20, 4, -20, 4) ? 0 : -0.8;

  return shackle(x, y);
}

function key(x: number, y: number): number {
  if (Math.abs(Math.hypot(x - 12, y + 4) - 4) < 1) return -1;
  if (inside(x, y, 12, 0, 30, 0)) return -1;

  return inside(x, y, 27, 1, 27, 4) ? -1 : SKIP;
}

function card(x: number, y: number): number {
  if (!inside(x, y, -42, -18, 42, 18)) return 0;

  return Math.abs(x) === 42 || Math.abs(y) === 18 ? 1 : 0.06;
}

export const recoveryScene: IScene = {
  shade: ({ width, height, seconds }) => {
    const layers = stack([lock, key, card]);
    const offset = Math.round(Math.sin(seconds * 0.8));

    return (x, y) => layers(x - Math.floor(width / 2), y - Math.floor(height / 2) + offset);
  },
  moving: (frame) => [{ x: frame.width / 2 - 43, y: frame.height / 2 - 20, width: 86, height: 40 }],
};

function shackle(x: number, y: number): number {
  return Math.abs(Math.hypot(x + 20, y + 3) - 7) < 1 && y < -1 ? 1 : SKIP;
}
