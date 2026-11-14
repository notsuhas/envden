import { requestRoute } from "../routes/policy.ts";
import { equal, sha256 } from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";

export const maxRequestBodySize = 33554432;

export function bodyLimit(request: Request): number {
  return requestRoute(request).limit;
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
): Promise<Uint8Array> {
  const hasher = sha256.create();
  const length = request.headers.get("Content-Length");

  if (length && (!/^\d+$/.test(length) || Number(length) > limit))
    throw new EnvdenError("INVALID_INPUT", "Request too large");

  const reader = request.body?.getReader();

  const chunks: Uint8Array[] = [];
  let size = 0;

  let stop = () => {};

  const deadline = new Promise<never>((_resolve, reject) => {
    stop = schedule(
      () => reject(new EnvdenError("INVALID_INPUT", "Body read deadline exceeded")),
      Math.min(600000, 10000 + Math.ceil(Number(length ?? 0) / 32768) * 1000),
    );
  });

  try {
    while (true) {
      const chunk = await Promise.race([reader?.read(), deadline]);
      if (!chunk || chunk.done) break;
      size += chunk.value.length;
      if (size > limit) throw new EnvdenError("INVALID_INPUT", "Request too large");
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
