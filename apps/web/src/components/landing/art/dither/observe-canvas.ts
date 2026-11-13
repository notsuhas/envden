export function observeCanvas(
  canvas: HTMLCanvasElement,
  fit: () => void,
  animate: () => void,
  stop: () => void,
  running: boolean,
): () => void {
  const observer = new ResizeObserver(fit);
  observer.observe(canvas);
  fit();
  if (running) animate();

  return () => {
    stop();
    observer.disconnect();
  };
}
