import { SKIP, stack } from "@/components/landing/art/dither/scene.ts";
import type { IScene, ISceneFrame, TShader } from "@/components/landing/art/dither/scene.ts";

const STROKE_SECONDS = 1.6;

function ramShade(column: number, y: number, ram: number, half: number, bed: number): number {
  if (column <= 1 && y < ram) return 1;
  if (column <= half - 3 && y >= ram && y < ram + 4) return y === ram ? 1 : -1;
  if (column <= half - 4 && y >= bed - 3) return 0.6;

  return 0;
}

// a sealing press: two posts, a beam, and a ram that comes down once per stroke
function pressLayer(frame: ISceneFrame): TShader {
  const { width, height, seconds } = frame;
  const centre = Math.floor(width / 2);
  const half = Math.min(10, centre - 2);
  const bed = height - 3;
  const beat = (seconds % STROKE_SECONDS) / STROKE_SECONDS;
  const drop = Math.max(0, 1 - Math.abs(beat - 0.5) * 4);
  const ram = Math.round(3 + drop * (bed - 12));

  return (x, y) => {
    const column = Math.abs(x - centre);
    if (y >= bed) return column <= half + 2 ? 1 : SKIP;
    if (y <= 1) return column <= half ? 1 : SKIP;
    if (column === half) return 1;
    if (column > half) return SKIP;

    return ramShade(column, y, ram, half, bed);
  };
}

export const pressScene: IScene = {
  shade: (frame) => stack([pressLayer(frame)]),
  moving: (frame) => [{ x: 0, y: 0, width: frame.width, height: frame.height }],
};
