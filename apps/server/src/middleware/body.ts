import { equal, sha256 } from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";

export const maxRequestBodySize = 33554432;

export function bodyLimit(request: Request): number {
  const path = new URL(request.url).pathname;

  return path === "/v1/vault"
    ? 65536
    : path.startsWith("/v1/blobs/")
      ? 16777216
      : /\/(history|chain|material|swap|vault)(\/|$)/.test(path)
        ? maxRequestBodySize
        : 65536;
}

export async function readBody(
  request: Request,
  limit = bodyLimit(request),
  expectedHash?: Uint8Array,
): Promise<Uint8Array> {
  const hasher = sha256.create();
  const length = request.headers.get("Content-Length");

  if (length && (!/^\d+$/.test(length) || Number(length) > limit))
    throw new EnvdenError("INVALID_INPUT", "Request too large");

  const reader = request.body?.getReader();

  const chunks: Uint8Array[] = [];
  let size = 0;

  try {
    while (true) {
      const chunk = await reader?.read();
      if (!chunk || chunk.done) break;
      size += chunk.value.length;
      if (size > limit) throw new EnvdenError("INVALID_INPUT", "Request too large");
      hasher.update(chunk.value);
      chunks.push(chunk.value);
    }
  } finally {
    await reader?.cancel();
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
