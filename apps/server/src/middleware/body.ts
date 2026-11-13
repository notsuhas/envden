import { EnvdenError } from "@envden/core/errors";

export const maxRequestBodySize = 33554432;

export async function readBody(request: Request): Promise<Uint8Array> {
  const path = new URL(request.url).pathname;

  const limit = path.startsWith("/v1/blobs/")
    ? 16777216
    : /\/(history|chain|material|swap|vault)(\/|$)/.test(path)
      ? maxRequestBodySize
      : 65536;

  const length = request.headers.get("Content-Length");

  if (length && (!/^\d+$/.test(length) || Number(length) > limit))
    throw new EnvdenError("INVALID_INPUT", "Request too large");

  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;

  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.length;
      if (size > limit) throw new EnvdenError("INVALID_INPUT", "Request too large");
      chunks.push(chunk.value);
    }
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }

  const body = new Uint8Array(size);
  let offset = 0;

  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.length;
  }

  return body;
}
