import { inside } from "@/components/landing/art/geometry/bounds.ts";
import { SKIP } from "@/components/landing/art/dither/scene.ts";
import type { TShader } from "@/components/landing/art/dither/scene.ts";
import { moundDistance } from "@/components/landing/art/den/land.ts";
import type { IDenLayout } from "@/components/landing/art/den/layout.ts";

function archDistance(layout: IDenLayout, x: number, y: number): number {
  const centreY = layout.doorTop + layout.doorHalf;
  const side = Math.abs(x - layout.doorX) - layout.doorHalf;
  if (y >= centreY) return Math.max(side, y - layout.doorBase);

  return Math.hypot(x - layout.doorX, y - centreY) - layout.doorHalf;
}

function sheetShade(layout: IDenLayout, x: number, y: number): number {
  const half = Math.round(layout.doorHalf * 0.5);
  const tall = Math.round(layout.doorHalf * 1.35);
  const bob = Math.round(Math.sin(layout.frame.seconds * 0.9) * 1.5);
  const top = Math.round(layout.doorBase - layout.doorHalf * 0.5 - tall + bob);
  const left = Math.round(layout.doorX) - half;
  const column = x - left;
  const row = y - top;
  if (!inside(column, row, 0, 0, half * 2, tall)) return SKIP;

  const fold = half * 2 - column + row < 4;
  if (fold) return SKIP;

  const text = row > 3 && row % 3 === 1 && column > 1 && column < half * 2 - 1 - ((row * 5) % 4);

  return text ? 0 : 1;
}

// the lit doorway, the env file inside it and the light it throws on the hill
export function doorLayer(layout: IDenLayout): TShader {
  const { breath, doorHalf, doorBase, doorX } = layout;

  return (x, y) => {
    const distance = archDistance(layout, x, y);

    if (distance <= -2) {
      const sheet = sheetShade(layout, x, y);
      if (sheet !== SKIP) return sheet;

      const spread = Math.hypot(x - doorX, (y - doorBase + doorHalf) * 0.7) / (doorHalf * 1.6);

      return -(breath * Math.max(0.3, 1 - spread * 0.7));
    }

    if (distance <= 0) return 1;
    if (distance <= 1.5) return 0;

    if (y > doorBase) {
      const drop = (y - doorBase) / (doorHalf * 1.3);
      const reach = Math.abs(x - doorX) / (doorHalf + (y - doorBase) * 1.6);
      if (Math.max(drop, reach) < 1) return -(breath * 0.75 * (1 - drop) * (1 - reach));

      return SKIP;
    }

    if (moundDistance(layout, x, y) > -1) return SKIP;

    const halo = breath * 0.55 * Math.exp(-distance / (doorHalf * 0.8));

    return halo > 0.06 ? -halo : SKIP;
  };
}
