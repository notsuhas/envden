import type { ISceneFrame } from "@/components/landing/art/dither/scene.ts";

export interface IDenLayout {
  frame: ISceneFrame;
  moundX: number;
  moundY: number;
  moundRadiusX: number;
  moundRadiusY: number;
  doorX: number;
  doorBase: number;
  doorHalf: number;
  doorTop: number;
  laptopX: number;
  desktopX: number;
  breath: number;
}

export function groundAt(layout: IDenLayout, x: number): number {
  const { height } = layout.frame;

  return height * 0.84 + 2 * Math.sin(x * 0.045) + Math.sin(x * 0.13 + 1);
}

export function denLayout(frame: ISceneFrame): IDenLayout {
  const { width, height, seconds } = frame;
  const moundX = width * 0.54;
  const doorHalf = Math.max(11, Math.min(width * 0.075, height * 0.11));

  const layout = {
    frame,
    moundX,
    moundY: height * 1.02,
    moundRadiusX: Math.min(width * 0.36, height * 0.8),
    moundRadiusY: height * 0.66,
    doorX: moundX,
    doorBase: 0,
    doorHalf,
    doorTop: 0,
    laptopX: Math.max(20, width * 0.11),
    desktopX: Math.min(width - 20, width * 0.9),
    breath:
      (0.8 + 0.2 * Math.sin(seconds * 1.3)) * (1 - (frame.excitement ?? 0)) +
      (frame.excitement ?? 0),
  };

  layout.doorBase = Math.round(groundAt(layout, moundX));
  layout.doorTop = layout.doorBase - doorHalf * 2.5;

  return layout;
}
