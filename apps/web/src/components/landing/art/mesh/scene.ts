import { inside } from "@/components/landing/art/geometry/bounds.ts";
import { SCREEN_HALF, SCREEN_TALL, screenShade } from "@/components/landing/art/den/machines.ts";
import { cellNoise } from "@/components/landing/art/dither/noise.ts";
import { SKIP, stack } from "@/components/landing/art/dither/scene.ts";
import type { IScene, TShader } from "@/components/landing/art/dither/scene.ts";
import { meshLayout } from "@/components/landing/art/mesh/layout.ts";
import type { IMeshLayout } from "@/components/landing/art/mesh/layout.ts";

const BOX_HALF = 17;
const BOX_TALL = 12;
const PACKET_SECONDS = 3.2;

function bayShade(column: number, row: number, seconds: number): number {
  const bay = Math.floor((row + BOX_TALL) / 8);
  const offset = (row + BOX_TALL) % 8;
  if (offset === 0) return 1;

  if (inside(column, offset, BOX_HALF - 5, 3, BOX_HALF - 3, 5)) {
    return Math.floor(seconds * (1.3 + bay * 0.6)) % 2 === 0 ? -1 : 0;
  }

  return column < BOX_HALF - 8 && offset === 4 && column % 2 === 0 ? 1 : 0;
}

// a home server box: three drive bays, each with a light that blinks on its own beat
function serverLayer(layout: IMeshLayout): TShader {
  const { server, frame } = layout;

  return (x, y) => {
    const column = x - server.x;
    const row = y - server.y;
    if (!inside(column, row, -BOX_HALF - 3, -BOX_TALL, BOX_HALF + 3, BOX_TALL + 2)) return SKIP;
    if (row > BOX_TALL) return Math.abs(column) <= BOX_HALF ? 0.4 : SKIP;
    if (column > BOX_HALF) return row > -BOX_TALL + 2 ? 0.55 : SKIP;
    if (Math.abs(column) > BOX_HALF) return SKIP;
    if (Math.abs(column) === BOX_HALF || Math.abs(row) === BOX_TALL) return 1;

    return bayShade(column, row, frame.seconds);
  };
}

function devicesLayer(layout: IMeshLayout): TShader {
  return (x, y) => {
    for (const device of layout.devices) {
      const shade = screenShade(x - device.x, y - (device.y - Math.floor(SCREEN_TALL / 2)), 4);
      if (shade !== SKIP) return shade;
    }

    return SKIP;
  };
}

function linksLayer(layout: IMeshLayout): TShader {
  const { server, devices, frame } = layout;

  return (x, y) => {
    for (const [index, device] of devices.entries()) {
      const spanX = device.x - server.x;
      const spanY = device.y - server.y;
      const along = ((x - server.x) * spanX + (y - server.y) * spanY) / (spanX ** 2 + spanY ** 2);
      if (along < 0.16 || along > 0.86) continue;

      const off = Math.hypot(x - server.x - spanX * along, y - server.y - spanY * along);
      if (off > 2) continue;

      const beat = (frame.seconds / PACKET_SECONDS + index * 0.37) % 2;
      const packet = 0.16 + 0.7 * (beat < 1 ? beat : 2 - beat);
      if (Math.abs(along - packet) * Math.hypot(spanX, spanY) < 2) return -1;

      return off < 0.6 && Math.floor(along * Math.hypot(spanX, spanY)) % 3 === 0 ? 1 : SKIP;
    }

    return SKIP;
  };
}

function fieldLayer(): TShader {
  return (x, y) => (x % 8 === 0 && y % 8 === 0 && cellNoise(y, x, 1) < 0.6 ? 0.5 : 0);
}

export const meshScene: IScene = {
  shade: (frame) => {
    const layout = meshLayout(frame);

    return stack([serverLayer(layout), devicesLayer(layout), linksLayer(layout), fieldLayer()]);
  },
  moving: (frame) => {
    const { server, devices } = meshLayout(frame);

    return [
      { x: server.x - BOX_HALF, y: server.y - BOX_TALL, width: BOX_HALF * 2, height: BOX_TALL * 2 },
      ...devices.map((device) => ({
        x: Math.min(server.x, device.x) - 3,
        y: Math.min(server.y, device.y) - 3,
        width: Math.abs(device.x - server.x) + 6,
        height: Math.abs(device.y - server.y) + 6,
      })),
      ...devices.map((device) => ({
        x: device.x - SCREEN_HALF,
        y: device.y - Math.floor(SCREEN_TALL / 2),
        width: SCREEN_HALF * 2 + 1,
        height: SCREEN_TALL + 1,
      })),
    ];
  },
};
