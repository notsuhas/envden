import { between } from "@/components/landing/art/geometry/bounds.ts";
import { SKIP } from "@/components/landing/art/dither/scene.ts";
import type { TShader } from "@/components/landing/art/dither/scene.ts";
import { groundAt } from "@/components/landing/art/den/layout.ts";
import type { IDenLayout } from "@/components/landing/art/den/layout.ts";

export const SCREEN_HALF = 10;
export const SCREEN_TALL = 13;
const PACKET_SECONDS = 4.5;

function packetShade(
  onPush: boolean,
  pushAt: number,
  pullAt: number,
  phase: number,
  x: number,
  y: number,
  cable: number,
): number {
  const packet = onPush ? pushAt : pullAt;
  const live = onPush ? phase < 0.5 : phase >= 0.5;
  if (live && Math.abs(x - packet) <= 1.5) return -1;

  return cableShade(y, cable, x);
}

function cableShade(y: number, cable: number, x: number): number {
  return y === cable && x % 3 === 0 ? 1 : SKIP;
}

export function screenShade(column: number, row: number, lines: number): number {
  if (Math.abs(column) > SCREEN_HALF || row < 0 || row > SCREEN_TALL) return SKIP;
  if (Math.abs(column) === SCREEN_HALF || row === 0 || row === SCREEN_TALL) return 1;

  const line = (row - 2) / 3;

  const text =
    row > 1 && row % 3 === 2 && line < lines && column < SCREEN_HALF - 2 - (line % 3) * 3;

  return text && column > -SCREEN_HALF + 1 ? -1 : 0;
}

function machineShade(layout: IDenLayout, x: number, y: number, centre: number, lines: number) {
  const foot = Math.round(groundAt(layout, centre)) - 1;
  const column = x - Math.round(centre);
  const screen = screenShade(column, y - (foot - SCREEN_TALL - 2), lines);
  if (screen !== SKIP) return screen;
  if (y === foot && Math.abs(column) <= SCREEN_HALF + 3) return 1;
  if (y === foot - 1 && Math.abs(column) <= 1) return 1;

  return SKIP;
}

// a laptop and a desktop wired to the den, with a packet riding each cable
export function machinesLayer(layout: IDenLayout): TShader {
  const seconds = layout.frame.packetSeconds ?? layout.frame.seconds;
  const laptop = layout.laptopX;
  const desktop = layout.desktopX;
  const phase = (seconds % PACKET_SECONDS) / PACKET_SECONDS;
  const doorLeft = layout.doorX - layout.doorHalf - 3;
  const doorRight = layout.doorX + layout.doorHalf + 3;

  const pushAt =
    laptop + SCREEN_HALF + 4 + (doorLeft - laptop - SCREEN_HALF - 4) * Math.min(1, phase * 2);

  const pullAt = doorRight + (desktop - SCREEN_HALF - 4 - doorRight) * Math.max(0, phase * 2 - 1);
  const filled = phase > 0.5 ? 4 : 0;

  return (x, y) => {
    const laptopShade = machineShade(layout, x, y, laptop, 4);
    if (laptopShade !== SKIP) return laptopShade;

    const desktopShade = machineShade(layout, x, y, desktop, filled);
    if (desktopShade !== SKIP) return desktopShade;

    const cable = Math.round(groundAt(layout, x)) + 3;
    if (Math.abs(y - cable) > 1) return SKIP;

    const onPush = between(x, laptop + SCREEN_HALF + 4, doorLeft - 1);
    const onPull = between(x, doorRight + 1, desktop - SCREEN_HALF - 4);
    if (!onPush && !onPull) return SKIP;

    return packetShade(onPush, pushAt, pullAt, phase, x, y, cable);
  };
}
