import type { TServer } from "./server.ts";

export function gatePairing(server: TServer): void {
  const upstream = server.url;
  const ready = new Set<string>();
  const waiting = new Map<string, (() => void)[]>();
  const release = (path: string) => {
    ready.add(path);
    for (const wake of waiting.get(path) ?? []) wake();
    waiting.delete(path);
  };
  const proxy = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const url = new URL(request.url);
      const slot = /^\/v1\/pairing\/mailboxes\/\d+\/[A-Za-z0-9]+$/.test(url.pathname);
      const approver = url.pathname === "/v1/pairing/approver";
      if (request.method === "GET" && (slot || approver) && !ready.has(url.pathname)) {
        await new Promise<void>((resolve) =>
          waiting.set(url.pathname, [...(waiting.get(url.pathname) ?? []), resolve]),
        );
      }
      const response = await fetch(
        new Request(new URL(url.pathname + url.search, upstream), request),
      );
      if (response.ok && request.method === "POST" && url.pathname === "/v1/pairing/mailboxes")
        ready.delete("/v1/pairing/approver");
      if (response.ok && request.method === "PUT" && slot) release(url.pathname);
      if (response.ok && request.method === "POST" && url.pathname === "/v1/swap")
        release("/v1/pairing/approver");
      return response;
    },
  });
  server.url = `http://127.0.0.1:${proxy.port}`;
  const stop = server.stop;
  server.stop = async () => {
    await proxy.stop(true);
    return stop();
  };
}
