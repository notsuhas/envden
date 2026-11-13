import { inside } from "@/components/landing/art/geometry/bounds.ts";
import { SKIP } from "@/components/landing/art/dither/scene.ts";
import type { TShader } from "@/components/landing/art/dither/scene.ts";
import type { IDenLayout } from "@/components/landing/art/den/layout.ts";

export const MAST = 16;
export const RING_SPAN = 34;
const RING_SPEED = 9;

export function mastTip(layout: IDenLayout) {
  const mastX = Math.round(layout.moundX + layout.moundRadiusX * 0.42);
  const offset = (mastX - layout.moundX) / layout.moundRadiusX;
  const foot = Math.round(layout.moundY - layout.moundRadiusY * Math.sqrt(1 - offset * offset));

  return { mastX, tip: foot - MAST };
}

export function antennaLayer(layout: IDenLayout): TShader {
  const { seconds } = layout.frame;
  const { mastX, tip } = mastTip(layout);
  const foot = tip + MAST;
  const blink = Math.floor(seconds * 1.6) % 2 === 0;
  const first = (seconds * RING_SPEED) % RING_SPAN;
  const second = (first + RING_SPAN / 2) % RING_SPAN;

  return (x, y) => {
    if (inside(x, y, mastX, tip + 1, mastX, foot)) return 1;
    if (inside(x, y, mastX - 1, tip - 1, mastX + 1, tip + 1)) return blink ? -1 : 1;
    if (y > tip + 2) return SKIP;

    const reach = Math.hypot(x - mastX, y - tip);

    for (const ring of [first, second]) {
      if (ring > 4 && Math.abs(reach - ring) < 0.6) return 0.85 * (1 - ring / RING_SPAN);
    }

    return SKIP;
  };
}
