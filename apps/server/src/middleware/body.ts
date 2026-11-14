import { requestRoute } from "../routes/policy.ts";
import { equal, sha256 } from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";

export const maxRequestBodySize = 33554432;

export function bodyLimit(request: Request): number {
  return requestRoute(request).limit;
}

export function declaredBodySize(request: Request, limit: number): number {
  const length = request.headers.get("Content-Length");

  if (
    length !== null &&
    (!/^\d+$/.test(length) || !Number.isSafeInteger(Number(length)) || Number(length) > limit)
  )
    throw new EnvdenError("INVALID_INPUT", "Request too large");

  return length === null ? limit : Math.min(limit, Number(length));
}

function scheduleDeadline(expire: () => void, timeout: number): () => void {
  const timer = setTimeout(expire, timeout);

  return () => clearTimeout(timer);
}

export async function readBody(
  request: Request,
  limit = bodyLimit(request),
  expectedHash?: Uint8Array,
  schedule = scheduleDeadline,
  now: () => number = () => performance.now(),
): Promise<Uint8Array> {
  const hasher = sha256.create();
  const capacity = declaredBodySize(request, limit);

  const reader = request.body?.getReader();

  const chunks: Uint8Array[] = [];
  let size = 0;

  let stop = () => {};

  const started = now();
  let extend = (_size: number) => {};

  const deadline = new Promise<never>((_resolve, reject) => {
    const expire = () => reject(new EnvdenError("INVALID_INPUT", "Body read deadline exceeded"));

    extend = (received) => {
      stop();

      stop = schedule(
        expire,
        Math.max(
          0,
          Math.min(600000, 10000 + Math.floor(received / 32768) * 1000) - (now() - started),
        ),
      );
    };

    extend(0);
  });

  try {
    while (true) {
      const chunk = await Promise.race([reader?.read(), deadline]);
      if (!chunk || chunk.done) break;
      size += chunk.value.length;
      if (size > capacity) throw new EnvdenError("INVALID_INPUT", "Request too large");
      extend(size);
      hasher.update(chunk.value);
      chunks.push(chunk.value);
    }
  } finally {
    stop();
    void reader?.cancel().catch(() => {});
    reader?.releaseLock();
  }

  if (expectedHash && !equal(hasher.digest(), expectedHash))
    throw new EnvdenError("UNAUTHORIZED", "Request body hash mismatch");

  const body = new Uint8Array(size);
  let offset = 0;

  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.length;
  }

  return body;
}
