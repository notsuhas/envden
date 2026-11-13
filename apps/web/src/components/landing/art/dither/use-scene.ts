import { observeCanvas } from "@/components/landing/art/dither/observe-canvas.ts";
import { useEffect } from "react";
import type { RefObject } from "react";
import { paintRegion } from "@/components/landing/art/dither/paint.ts";
import { clampRegion } from "@/components/landing/art/dither/scene.ts";
import type { IScene } from "@/components/landing/art/dither/scene.ts";

const FRAME_MS = 1000 / 15;
const STILL_SECONDS = 3;

interface ISceneOptions {
  scene: IScene;
  pixel: number;
  running: boolean;
}

export function useScene(ref: RefObject<HTMLCanvasElement | null>, options: ISceneOptions): void {
  const { scene, pixel, running } = options;

  useEffect(() => {
    const canvas = ref.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    let image: ImageData | undefined;
    let frame = 0;
    let lastDraw = 0;

    const fit = () => {
      const width = Math.max(1, Math.floor(canvas.clientWidth / pixel));
      const height = Math.max(1, Math.floor(canvas.clientHeight / pixel));
      if (image?.width === width && image.height === height) return;

      canvas.width = width;
      canvas.height = height;
      image = context.createImageData(width, height);

      const still = { width, height, seconds: STILL_SECONDS };
      paintRegion(image, scene.shade(still), { x: 0, y: 0, width, height });
      context.putImageData(image, 0, 0);
    };

    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      if (now - lastDraw < FRAME_MS) return;
      if (!image) return;

      lastDraw = now;
      const moment = { width: image.width, height: image.height, seconds: now / 1000 };
      const shader = scene.shade(moment);

      for (const moving of scene.moving(moment)) {
        const region = clampRegion(moving, moment);

        paintRegion(image, shader, region);
        context.putImageData(image, 0, 0, region.x, region.y, region.width, region.height);
      }
    };

    return observeCanvas(
      canvas,
      fit,
      () => {
        frame = requestAnimationFrame(tick);
      },
      () => cancelAnimationFrame(frame),
      running,
    );
  }, [ref, scene, pixel, running]);
}
