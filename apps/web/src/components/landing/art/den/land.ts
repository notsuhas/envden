import { cellNoise } from "@/components/landing/art/dither/noise.ts";
import { SKIP } from "@/components/landing/art/dither/scene.ts";
import type { TShader } from "@/components/landing/art/dither/scene.ts";
import { groundAt } from "@/components/landing/art/den/layout.ts";
import type { IDenLayout } from "@/components/landing/art/den/layout.ts";

export function moundDistance(layout: IDenLayout, x: number, y: number): number {
  const dx = (x - layout.moundX) / layout.moundRadiusX;
  const dy = (y - layout.moundY) / layout.moundRadiusY;

  return (Math.hypot(dx, dy) - 1) * Math.min(layout.moundRadiusX, layout.moundRadiusY);
}

export function ridgeLayer(layout: IDenLayout): TShader {
  const { height } = layout.frame;

  return (x, y) => {
    const ridge = height * 0.6 + 7 * Math.sin(x * 0.03 + 1) + 3 * Math.sin(x * 0.08);
    if (y < ridge - 0.5) return SKIP;
    if (y < ridge + 0.5) return x % 2 === 0 ? 1 : 0;

    return cellNoise(y, x, 3) < 0.05 ? 0.6 : 0.03;
  };
}

export function moundLayer(layout: IDenLayout): TShader {
  return (x, y) => {
    const distance = moundDistance(layout, x, y);
    if (distance > 0.6) return SKIP;
    if (distance > -0.6) return 1;

    const depth = Math.min(1, -distance / 60);
    const lit = (x - layout.moundX) / layout.moundRadiusX;

    return 0.2 - depth * 0.1 - lit * 0.1;
  };
}

export function groundLayer(layout: IDenLayout): TShader {
  const { height } = layout.frame;

  return (x, y) => {
    const ground = groundAt(layout, x);
    if (y < ground - 0.5) return SKIP;
    if (y < ground + 0.5) return 1;

    return 0.12 + ((y - ground) / (height - ground + 1)) * 0.3;
  };
}
