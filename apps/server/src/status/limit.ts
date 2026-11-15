interface IWindow {
  start: number;
  count: number;
}

const span = 60000;
const limit = 60;

// Returns the next window, or undefined when the request is over the limit.
export function admitRequest(window: IWindow, now: number): IWindow | undefined {
  if (now - window.start >= span) return { start: now, count: 1 };
  if (window.count >= limit) return undefined;

  return { start: window.start, count: window.count + 1 };
}
