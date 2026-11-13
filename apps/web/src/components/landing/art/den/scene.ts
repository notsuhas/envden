import { MAST, RING_SPAN, antennaLayer, mastTip } from "@/components/landing/art/den/antenna.ts";
import { doorLayer } from "@/components/landing/art/den/door.ts";
import { groundLayer, moundLayer, ridgeLayer } from "@/components/landing/art/den/land.ts";
import { denLayout } from "@/components/landing/art/den/layout.ts";
import { SCREEN_HALF, SCREEN_TALL, machinesLayer } from "@/components/landing/art/den/machines.ts";
import { skyLayer } from "@/components/landing/art/den/sky.ts";
import { stack } from "@/components/landing/art/dither/scene.ts";
import type { IScene } from "@/components/landing/art/dither/scene.ts";

export const denScene: IScene = {
  shade: (frame) => {
    const layout = denLayout(frame);

    return stack([
      machinesLayer(layout),
      doorLayer(layout),
      groundLayer(layout),
      antennaLayer(layout),
      moundLayer(layout),
      ridgeLayer(layout),
      skyLayer(),
    ]);
  },
  moving: (frame) => {
    const layout = denLayout(frame);
    const { mastX, tip } = mastTip(layout);
    const glow = layout.doorHalf * 3.4;

    return [
      {
        x: layout.doorX - glow,
        y: layout.doorTop - layout.doorHalf * 2.4,
        width: glow * 2,
        height: layout.doorBase - layout.doorTop + layout.doorHalf * 4,
      },
      { x: mastX - RING_SPAN, y: tip - RING_SPAN, width: RING_SPAN * 2, height: RING_SPAN + MAST },
      { x: 0, y: frame.height * 0.84 - 4, width: frame.width, height: 13 },
      {
        x: layout.desktopX - SCREEN_HALF,
        y: frame.height * 0.84 - SCREEN_TALL - 8,
        width: SCREEN_HALF * 2 + 1,
        height: SCREEN_TALL + 8,
      },
    ];
  },
};
