import { serve } from "../main.ts";
import type { createApp } from "../app.ts";

export function testNetwork() {
  const apps = new Map<string, ReturnType<typeof createApp>>();
  let next = 0;

  return {
    fetcher: async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      const app = apps.get(url.origin);
      if (!app) throw new Error(`No test server at ${url.origin}`);

      return app.request(input instanceof Request ? input : url.toString(), init);
    },
    serve: (options: Parameters<typeof serve>[0]) =>
      serve({
        ...options,
        listen: (app) => {
          const url = new URL(`http://server-${next++}.invalid`);
          apps.set(url.origin, app);

          return {
            url,
            stop: () => {
              apps.delete(url.origin);
            },
          };
        },
      }),
  };
}
