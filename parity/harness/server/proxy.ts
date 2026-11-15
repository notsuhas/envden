export function proxy(target: string) {
  let blocked = false;
  let hits = 0;

  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const url = new URL(request.url);

      if (blocked && url.pathname === "/v1/swap") {
        hits++;

        return new Response(null, { status: 503 });
      }

      return fetch(new URL(url.pathname + url.search, target), {
        method: request.method,
        headers: request.headers,
        body: request.body,
        redirect: "manual",
      }).catch(() => new Response(null, { status: 503 }));
    },
  });

  return {
    url: `http://127.0.0.1:${server.port}`,
    block: () => {
      blocked = true;
    },
    unblock: () => {
      blocked = false;
    },
    hits: () => hits,
    close: () => server.stop(true),
  };
}
