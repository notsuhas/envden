import { inside } from "@/components/landing/art/geometry/bounds.ts";
import { stack, SKIP } from "@/components/landing/art/dither/scene.ts";
import type { IScene, TShader } from "@/components/landing/art/dither/scene.ts";

function screen(x: number, y: number): number {
  if (!inside(x, y, -30, -19, 30, 19)) return SKIP;

  return Math.abs(x) >= 28 || Math.abs(y) >= 17 ? 0.8 : 0;
}

function stand(x: number, y: number): number {
  if (inside(x, y, -12, 20, 12, 23)) return 0.7;

  return inside(x, y, -23, 25, 23, 25) ? 1 : SKIP;
}

function text(seconds: number): TShader {
  return (x, y) => {
    if (inside(x, y, -19, -7, -13, -5)) return -1;
    if (inside(x, y, -19, 4, 17, 4)) return 0.5;
    if (inside(x, y, 14, 8, 16, 10)) return blink(seconds);

    return SKIP;
  };
}

export const finaleScene: IScene = {
  shade: ({ width, height, seconds }) => {
    const layers = stack([text(seconds), screen, stand]);

    return (x, y) => composed(layers, x - Math.floor(width / 2), y - Math.floor(height / 2));
  },
  moving: (frame) => [{ x: frame.width / 2 - 30, y: frame.height / 2 - 19, width: 60, height: 38 }],
};

function field(x: number, y: number): number {
  return x % 10 === 0 && y % 10 === 0 ? 0.2 : 0;
}

function composed(layers: TShader, x: number, y: number): number {
  const shape = layers(x, y);

  return shape === 0 ? field(x, y) : shape;
}

function blink(seconds: number): number {
  return Math.floor(seconds) % 2 ? -1 : 0;
}
