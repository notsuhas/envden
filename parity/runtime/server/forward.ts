export function forward(request: Request, upstream: string): Promise<Response> {
  const url = new URL(request.url);

  return fetch(new Request(new URL(url.pathname + url.search, upstream).href, request), {
    redirect: "manual",
  });
}

export function listen(fetch: (request: Request) => Promise<Response> | Response) {
  const proxy = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch });

  return { url: `http://127.0.0.1:${proxy.port}`, stop: () => proxy.stop(true) };
}
