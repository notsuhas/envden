import type { IFunnelChild } from "../funnel/child.ts";

const encoder = new TextEncoder();

// A funnel child that prints `stdout` and runs until killed, or fails at once with `failure`.
export function funnelChild(stdout: string, failure?: { stderr: string }): IFunnelChild {
  let stop = () => {};
  const exited = new Promise<number>((resolve) => (stop = () => resolve(failure ? 1 : 0)));

  const stream = (text: string) =>
    new ReadableStream<Uint8Array>({
      start: (controller) => {
        if (text) controller.enqueue(encoder.encode(text));

        if (failure) controller.close();
        else void exited.then(() => controller.close());
      },
    });

  if (failure) stop();

  return { stdout: stream(stdout), stderr: stream(failure?.stderr ?? ""), exited, kill: stop };
}

export const FUNNEL_UP =
  "Available on the internet:\n\nhttps://laptop.tail.example:10000/s/abc\n|-- proxy http://127.0.0.1:8080/s/abc\n\nPress Ctrl+C to exit.\n";
