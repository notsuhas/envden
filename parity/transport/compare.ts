import type { ICase } from "./cases.ts";
import { exchange } from "./socket.ts";
import { comparableMany, responseLength } from "./wire.ts";

const RESPONSE_DEADLINE = 10000;
const CLOSE_DEADLINE = 14000;

// A single request finishes with its first response; stalled and pipelined ones wait for the close.
function completion(item: ICase): ((bytes: Buffer) => boolean) | undefined {
  if (item.stalled || item.methods.length > 1) return undefined;

  return (bytes) => responseLength(bytes, item.methods[0]!) !== undefined;
}

export async function observe(port: number, item: ICase) {
  const timeoutMs = item.stalled ? CLOSE_DEADLINE : RESPONSE_DEADLINE;
  const reply = await exchange({ port, request: item.request, timeoutMs, done: completion(item) });
  const responses = comparableMany(reply.bytes, item.methods);

  return item.stalled ? { responses, closed: reply.closed } : { responses };
}

export function reachedStatus(item: ICase, observed: Awaited<ReturnType<typeof observe>>) {
  return !item.status || observed.responses[0]?.status.startsWith(`HTTP/1.1 ${item.status} `);
}
