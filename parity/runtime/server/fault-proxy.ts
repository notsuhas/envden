import { forward, listen } from "./forward.ts";

// Fails one protocol path while armed, so an interrupted operation stops at a named boundary.
export function faultProxy(upstream: string, path: string, status = 503) {
  let armed = false;
  let hits = 0;

  const proxy = listen((request) => {
    if (armed && new URL(request.url).pathname === path) {
      hits++;

      return new Response(null, { status });
    }

    return forward(request, upstream).catch(() => new Response(null, { status: 503 }));
  });

  return {
    url: proxy.url,
    arm: () => {
      armed = true;
    },
    disarm: () => {
      armed = false;
    },
    hits: () => hits,
    stop: proxy.stop,
  };
}
