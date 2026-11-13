import { cellNoise } from "@/components/landing/art/dither/noise.ts";
import type { TShader } from "@/components/landing/art/dither/scene.ts";

const STAR_ODDS = 0.0045;

export function skyLayer(): TShader {
  return (x, y) => {
    const seed = cellNoise(y, x, 0);
    if (seed > STAR_ODDS) return 0;

    return seed < STAR_ODDS * 0.25 ? -1 : 1;
  };
}
