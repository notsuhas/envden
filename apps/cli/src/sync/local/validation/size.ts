import { sanitizeTerminal } from "../../../output/sanitize.ts";

export function fileSizeNotice(path: string, bytes: Uint8Array | undefined) {
  if (bytes && bytes.byteLength > 1048576)
    return sanitizeTerminal(`Skipped oversized env file: ${path} exceeds 1 MiB`);

  return undefined;
}
