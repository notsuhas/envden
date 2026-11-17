import type { ICase } from "./cases.ts";
import { exchange } from "./socket.ts";
import { comparableMany, responseLength } from "./wire.ts";

const RESPONSE_DEADLINE = 10000;
const CLOSE_DEADLINE = 14000;

// A single request finishes with its first response; stalled and pipelined ones wait for the close.
function completion(item: ICase): ((bytes: Buffer) => boolean) | undefined {
  if (waitForClose(item) || item.methods.length > 1) return undefined;

  return (bytes) => responseLength(bytes, item.methods[0]!) !== undefined;
}

export async function observe(port: number, item: ICase) {
  const timeoutMs = item.stalled ? CLOSE_DEADLINE : RESPONSE_DEADLINE;
  const reply = await exchange({ port, request: item.request, timeoutMs, done: completion(item) });
  const responses = comparableMany(reply.bytes, item.methods);

  return waitForClose(item) ? { responses, closed: reply.closed } : { responses };
}

export function reachedStatus(item: ICase, observed: Awaited<ReturnType<typeof observe>>) {
  return !item.status || observed.responses[0]?.status.startsWith(`HTTP/1.1 ${item.status} `);
}

function waitForClose(item: ICase): boolean {
  return Boolean(item.stalled || item.empty400 || /Connection: close/i.test(item.request));
}

export async function headLengths(item: ICase, ports: number[]): Promise<Map<number, number>[]> {
  const getLengths = ports.map(() => new Map<number, number>());

  {
    for (const [index, method] of item.methods.entries()) {
      if (method !== "HEAD") continue;

      const get = {
        ...item,
        request: item.request.replace(/HEAD /g, "GET "),
        methods: item.methods.map((m) => (m === "HEAD" ? "GET" : m)),
      };

      const replies = await Promise.all(ports.map((port) => observe(port, get)));

      for (const [side, reply] of replies.entries()) {
        const response = reply.responses[index];

        const length = response?.headers
          .find((h) => /^content-length:/i.test(h))
          ?.split(":")[1]
          ?.trim();

        if (length && /^\d+$/.test(length)) getLengths[side]!.set(index, Number(length));
      }
    }
  }

  return getLengths;
}
