import { observeCanvas } from "@/components/landing/art/dither/observe-canvas.ts";
import { useEffect } from "react";
import type { RefObject } from "react";
import {
  drawScramble,
  drawSettled,
  wordmarkGrid,
} from "@/components/landing/chrome/wordmark/draw.ts";

const FRAME_MS = 1000 / 12;
const MAX_PIXEL_RATIO = 2;

export function useWordmark(ref: RefObject<HTMLCanvasElement | null>, running: boolean): void {
  useEffect(() => {
    const canvas = ref.current;
    const context = canvas?.getContext("2d");
    const settled = document.createElement("canvas");
    const settledContext = settled.getContext("2d");
    if (!canvas || !context || !settledContext) return;

    const family = getComputedStyle(canvas).fontFamily;
    let grid = wordmarkGrid(1);
    let frame = 0;
    let lastDraw = 0;

    const fit = () => {
      const ratio = Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO);
      const width = canvas.clientWidth;

      grid = wordmarkGrid(width);
      canvas.style.height = `${grid.rows * grid.cellHeight}px`;

      for (const target of [canvas, settled]) {
        target.width = Math.round(width * ratio);
        target.height = Math.round(grid.rows * grid.cellHeight * ratio);
      }

      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      settledContext.setTransform(ratio, 0, 0, ratio, 0, 0);
      drawSettled(settledContext, grid, family);
      context.drawImage(settled, 0, 0, width, grid.rows * grid.cellHeight);
    };

    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      if (now - lastDraw < FRAME_MS) return;

      lastDraw = now;
      context.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
      context.drawImage(settled, 0, 0, canvas.clientWidth, grid.rows * grid.cellHeight);
      drawScramble(context, grid, family, now / 1000);
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
  }, [ref, running]);
}
