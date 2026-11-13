import { bayerThreshold } from "@/components/landing/art/dither/bayer.ts";
import type { IRegion, TShader } from "@/components/landing/art/dither/scene.ts";

function pack(red: number, green: number, blue: number): number {
  return ((255 << 24) | (blue << 16) | (green << 8) | red) >>> 0;
}

const CREAM = pack(237, 233, 224);
const AMBER = pack(247, 190, 84);

export function paintRegion(image: ImageData, shader: TShader, region: IRegion): void {
  const pixels = new Uint32Array(image.data.buffer);

  for (let y = region.y; y < region.y + region.height; y += 1) {
    for (let x = region.x; x < region.x + region.width; x += 1) {
      const shade = shader(x, y);
      const lit = Math.abs(shade) > bayerThreshold(x, y);

      pixels[y * image.width + x] = lit ? (shade > 0 ? CREAM : AMBER) : 0;
    }
  }
}
