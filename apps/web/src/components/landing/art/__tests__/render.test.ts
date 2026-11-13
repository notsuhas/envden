import { expect, test } from "bun:test";
import { denScene } from "../den/scene.ts";
import { denLayout } from "../den/layout.ts";
import { antennaLayer } from "../den/antenna.ts";
import { machinesLayer, screenShade } from "../den/machines.ts";
import { doorLayer } from "../den/door.ts";
import { ridgeLayer } from "../den/land.ts";
import { meshScene } from "../mesh/scene.ts";
import { pressScene } from "../press/scene.ts";
import { paintRegion } from "../dither/paint.ts";

function assertPalette(
  shade: (x: number, y: number) => number,
  width: number,
  height: number,
): void {
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const value = shade(x, y);

      if (!Number.isFinite(value) || value < -1 || value > 2)
        throw new Error(`Invalid shade at ${x}, ${y}`);
    }
  }
}

for (const width of [80, 220]) {
  test(`art has finite palette values at ${width}px and survives every animation phase`, () => {
    for (const seconds of [0, 0.4, 1, 2, 3, 4.5]) {
      const frame = { width, height: 100, seconds };
      const layout = denLayout(frame);

      const shaders = [
        denScene.shade(frame),
        meshScene.shade(frame),
        pressScene.shade(frame),
        antennaLayer(layout),
        machinesLayer(layout),
        doorLayer(layout),
        ridgeLayer(layout),
      ];

      for (const shade of shaders) assertPalette(shade, width, frame.height);
    }

    expect(screenShade(11, 0, 4)).toBe(2);
    expect(screenShade(10, 0, 4)).toBe(1);
    expect(screenShade(0, 2, 4)).toBe(-1);
  });
}

test("Bayer painting changes only the requested region and uses the strict palette", () => {
  const data = new Uint8ClampedArray(16 * 4);
  const image = { width: 4, height: 4, data, colorSpace: "srgb" } as ImageData;
  paintRegion(image, (x) => (x === 1 ? -1 : 1), { x: 1, y: 1, width: 2, height: 2 });
  expect(Array.from(data.slice(0, 20))).toEqual(Array(20).fill(0));
  expect(Array.from(data.slice(20, 28))).toEqual([247, 190, 84, 255, 237, 233, 224, 255]);
});
