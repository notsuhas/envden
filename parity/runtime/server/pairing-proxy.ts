import { forward, listen } from "./forward.ts";
import type { TServer } from "./start.ts";

const SLOT = /^\/v1\/pairing\/mailboxes\/\d+\/[A-Za-z0-9]+$/;
const APPROVER = "/v1/pairing/approver";

function gated(method: string, path: string): boolean {
  return method === "GET" && (SLOT.test(path) || path === APPROVER);
}

// What a successful write makes readable: a slot after its PUT, the approver after the swap.
function released(method: string, path: string): string | undefined {
  const target = SLOT.test(path) ? "slot" : path;
  const releases: Record<string, string> = { "PUT slot": path, "POST /v1/swap": APPROVER };

  return releases[`${method} ${target}`];
}

// Holds slot reads until the matching write, and approver reads until the signed swap, so polls never race.
export function gatePairing(server: TServer): void {
  const upstream = server.url;
  const ready = new Set<string>();
  const waiting = new Map<string, ((forward: boolean) => void)[]>();

  function release(path: string): void {
    ready.add(path);
    for (const wake of waiting.get(path) ?? []) wake(true);
    waiting.delete(path);
  }

  // A read still held at shutdown belongs to a cancelled pairing; it never reaches the server.
  function drop(): void {
    for (const wake of [...waiting.values()].flat()) wake(false);
    waiting.clear();
  }

  function update(response: Response, method: string, path: string): void {
    if (!response.ok) return;
    if (`${method} ${path}` === "POST /v1/pairing/mailboxes") ready.clear();

    const unlocked = released(method, path);

    if (unlocked) release(unlocked);
  }

  function hold(method: string, path: string): Promise<boolean> {
    if (!gated(method, path) || ready.has(path)) return Promise.resolve(true);

    return new Promise((resolve) => waiting.set(path, [...(waiting.get(path) ?? []), resolve]));
  }

  const proxy = listen(async (request) => {
    const path = new URL(request.url).pathname;

    if (!(await hold(request.method, path))) return new Response(null, { status: 503 });

    const response = await forward(request, upstream);

    update(response, request.method, path);

    return response;
  });

  const stop = server.stop;

  server.url = proxy.url;

  server.stop = async () => {
    drop();
    await proxy.stop();

    return stop();
  };
}
