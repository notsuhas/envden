import type { TContext } from "../db/context.ts";
import { equal, hex } from "../db/values.ts";
import { randomUUID } from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  linkSync,
  mkdirSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

export function createBlobs(context: TContext) {
  const { db, bytes, run, dataDir } = context;

  function blobPath(vault: Uint8Array, hash: Uint8Array): string {
    return join(dataDir, "blobs", hex(vault) || "empty", hex(hash) || "empty");
  }

  function putBlob(
    vault: Uint8Array,
    hash: Uint8Array,
    bytes: Uint8Array,
    verify?: (bytes: Uint8Array) => Uint8Array,
  ): void {
    if (verify && !equal(verify(bytes), hash)) throw new Error("Blob hash mismatch");

    db.transaction(() => {
      const dir = join(dataDir, "blobs", hex(vault) || "empty");
      mkdirSync(dir, { recursive: true, mode: 0o700 });
      const path = blobPath(vault, hash);
      const temp = join(dir, `.tmp-${randomUUID()}`);

      try {
        const fd = openSync(temp, "wx", 0o600);

        try {
          writeFileSync(fd, bytes);
          fsyncSync(fd);
        } finally {
          closeSync(fd);
        }

        try {
          linkSync(temp, path);
        } catch (error) {
          if (!existsSync(path)) throw error;

          if (!equal(readFileSync(path), bytes))
            throw new Error("Conflicting content for blob hash");
        }

        const dirFd = openSync(dir, "r");

        try {
          fsyncSync(dirFd);
        } finally {
          closeSync(dirFd);
        }

        run("INSERT OR IGNORE INTO blobs VALUES(?,?)", vault, hash);
      } finally {
        if (existsSync(temp)) unlinkSync(temp);
      }
    }).immediate();
  }

  function getBlob(vault: Uint8Array, hash: Uint8Array): Uint8Array | undefined {
    if (!bytes("SELECT hash AS bytes FROM blobs WHERE vault=? AND hash=?", vault, hash))
      return undefined;

    try {
      return readFileSync(blobPath(vault, hash));
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
      throw error;
    }
  }

  function blobHashes(vault: Uint8Array): Uint8Array[] {
    return db
      .query<{ hash: Uint8Array }, [Uint8Array]>(
        "SELECT hash FROM blobs WHERE vault=? ORDER BY hash",
      )
      .all(vault)
      .map((row) => row.hash);
  }

  return { putBlob, getBlob, blobHashes };
}
