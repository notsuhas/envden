import type { ISceneFrame } from "@/components/landing/art/dither/scene.ts";

interface IPoint {
  x: number;
  y: number;
}

export interface IMeshLayout {
  frame: ISceneFrame;
  server: IPoint;
  devices: IPoint[];
}

export function meshLayout(frame: ISceneFrame): IMeshLayout {
  const { width, height } = frame;

  return {
    frame,
    server: { x: Math.round(width * 0.5), y: Math.round(height * 0.54) },
    devices: [
      { x: Math.round(width * 0.14), y: Math.round(height * 0.3) },
      { x: Math.round(width * 0.86), y: Math.round(height * 0.26) },
      { x: Math.round(width * 0.8), y: Math.round(height * 0.86) },
    ],
  };
}
