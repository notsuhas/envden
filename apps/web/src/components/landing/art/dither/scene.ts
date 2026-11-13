export interface ISceneFrame {
  width: number;
  height: number;
  seconds: number;
  excitement?: number;
  packetSeconds?: number;
}

export interface IRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

// a shade is a level in 0..1: positive draws cream, negative draws amber
export type TShader = (x: number, y: number) => number;

export interface IScene {
  shade: (frame: ISceneFrame) => TShader;
  // the only parts repainted per frame; everything else is drawn once
  moving: (frame: ISceneFrame) => IRegion[];
}

export const SKIP = 2;

export function stack(layers: TShader[]): TShader {
  return (x, y) => {
    for (const layer of layers) {
      const shade = layer(x, y);
      if (shade !== SKIP) return shade;
    }

    return 0;
  };
}

export function clampRegion(region: IRegion, frame: ISceneFrame): IRegion {
  const x = Math.max(0, Math.floor(region.x));
  const y = Math.max(0, Math.floor(region.y));

  return {
    x,
    y,
    width: Math.max(0, Math.min(frame.width, Math.ceil(region.x + region.width)) - x),
    height: Math.max(0, Math.min(frame.height, Math.ceil(region.y + region.height)) - y),
  };
}
