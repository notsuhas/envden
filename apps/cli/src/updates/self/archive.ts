import { gunzipSync } from "node:zlib";
import { Parser, type ReadEntry } from "tar";
import { EnvdenError } from "@envden/core/errors";

export const RELEASE_SIZE_LIMIT = 256 * 1024 * 1024;

const ENTRIES = new Set(["envden", "LICENSE"]);

// Reads the binary in memory, so no archive path or link ever reaches the filesystem.
export async function extractBinary(archive: Uint8Array, limit = RELEASE_SIZE_LIMIT) {
  const files = await readEntries(inflate(archive, limit));
  const binary = files.get("envden");

  if (!binary) throw new EnvdenError("INVALID_DATA", "Release archive has no envden binary");

  return binary;
}

function inflate(archive: Uint8Array, limit: number) {
  try {
    return gunzipSync(archive, { maxOutputLength: limit });
  } catch (cause) {
    const tooLarge = (cause as { code?: unknown }).code === "ERR_BUFFER_TOO_LARGE";

    throw new EnvdenError(
      "INVALID_DATA",
      tooLarge ? "Release archive is too large" : "Release archive is not gzip",
      { cause },
    );
  }
}

function readEntries(tarball: Buffer) {
  return new Promise<Map<string, Uint8Array>>((resolve, reject) => {
    const reads: Promise<[string, Uint8Array]>[] = [];
    const seen = new Set<string>();

    const parser = new Parser({
      strict: true,
      onReadEntry(entry) {
        if (!expectedEntry(entry, seen)) {
          parser.abort(new EnvdenError("INVALID_DATA", "Unexpected entry in release archive"));

          return;
        }

        seen.add(entry.path);
        reads.push(entry.concat().then((data) => [entry.path, new Uint8Array(data)]));
      },
    });

    parser.on("error", (cause: unknown) =>
      reject(
        cause instanceof EnvdenError
          ? cause
          : new EnvdenError("INVALID_DATA", "Release archive is not a tar file", { cause }),
      ),
    );

    parser.on("end", () => Promise.all(reads).then((pairs) => resolve(new Map(pairs)), reject));
    parser.end(tarball);
  });
}

function expectedEntry(entry: ReadEntry, seen: ReadonlySet<string>) {
  return entry.type === "File" && ENTRIES.has(entry.path) && !seen.has(entry.path);
}
