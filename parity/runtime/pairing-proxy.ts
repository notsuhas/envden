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

  function update(response: Response, request: Request, url: URL, slot: boolean): void {
    if (!response.ok) return;
    if (request.method === "POST") posted(url.pathname);
    if (request.method === "PUT") uploaded(slot, url.pathname);
  }

  function uploaded(slot: boolean, path: string): void {
    if (slot) release(path);
  }

  function posted(path: string): void {
    if (path === "/v1/pairing/mailboxes") ready.delete("/v1/pairing/approver");
    if (path === "/v1/swap") release("/v1/pairing/approver");
  }

  async function waitForSlot(request: Request, url: URL, pairing: boolean): Promise<void> {
    if (request.method === "GET" && pairing && !ready.has(url.pathname)) {
      await new Promise<void>((resolve) =>
        waiting.set(url.pathname, [...(waiting.get(url.pathname) ?? []), resolve]),
      );
    }
  }

  const proxy = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const url = new URL(request.url);
      const slot = /^\/v1\/pairing\/mailboxes\/\d+\/[A-Za-z0-9]+$/.test(url.pathname);
      const approver = url.pathname === "/v1/pairing/approver";

      await waitForSlot(request, url, slot || approver);

      const response = await fetch(
        new Request(new URL(url.pathname + url.search, upstream).href, request),
      );

      update(response, request, url, slot);

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
