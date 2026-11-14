import { storedVersions } from "../vault/versions.ts";
import {
  FilesCodec,
  decode,
  equal,
  H,
  signedCodec,
  ManifestHeaderCodec,
} from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";
import type { IAppOptions } from "../http/types.ts";
import { input } from "../http/encoding.ts";

export function restoreFiles(
  options: IAppOptions,
  id: Uint8Array,
  hash: Uint8Array,
  bytes: Uint8Array,
) {
  const files = input(() => decode(FilesCodec, bytes));
  if (!equal(H("files", bytes), hash)) throw new EnvdenError("INVALID_DATA", "Files hash mismatch");

  const headers = (
    options.storage.headersForFiles?.(id, hash) ??
    options.storage.headers(id, 1n, 0xffffffffffffffffn)
  ).map((h) => decode(signedCodec(ManifestHeaderCodec), h.bytes).body);

  if (!headers.some((h) => equal(h.filesHash, hash)))
    throw new EnvdenError("INVALID_DATA", "Unreferenced files");

  if (!options.storage.putFileList)
    throw new EnvdenError("NOT_IMPLEMENTED", "File restoration unavailable");

  const permanent = headers.some(
    (h, i) =>
      h.op === 11 &&
      (equal(h.filesHash, hash) || (i > 0 && equal(headers[i - 1]!.filesHash, hash))),
  );

  options.storage.putFileList(
    id,
    {
      hash,
      bytes,
      retainForever: permanent,
      versions: storedVersions(files.entries),
    },
    options.now(),
  );

  return { kind: "uploaded" };
}
