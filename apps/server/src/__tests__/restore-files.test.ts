import { expect, test } from "bun:test";
import * as p from "@envden/core/protocol";
import type { IAppOptions } from "../http/types.ts";
import type { IStorageAdapter } from "@envden/core/adapters";
import { vaultFixture } from "./vault-fixture.ts";

import { spyOn } from "bun:test";
import { restoreFiles } from "../repair/files.ts";

test("file restoration validates encoding, hash and references before persisting retention and versions", async () => {
  const f = await vaultFixture();

  await f.initialize();

  const bytes = p.FilesCodec.write({
    entries: [
      {
        fileId: p.randomBytes(32),
        version: 2n,
        epoch: 1,
        state: 1,
        blobHash: p.randomBytes(32),
        name: p.randomBytes(32),
      },
    ],
  });

  const hash = p.H("files", bytes);

  const stored = {
    hash,
    seq: 1n,
    bytes: p
      .signedCodec(p.ManifestHeaderCodec)
      .write(f.next(f.create.header, { filesHash: hash }).header),
  };

  const headers = spyOn(f.storage, "headers").mockReturnValue([stored]);
  const put = spyOn(f.storage, "putFileList");

  try {
    expect(() => restoreFiles(f.options, f.vaultId, hash, new Uint8Array([255]))).toThrow();

    expect(() => restoreFiles(f.options, f.vaultId, new Uint8Array(32), bytes)).toThrow(
      "hash mismatch",
    );

    headers.mockReturnValue([]);
    expect(() => restoreFiles(f.options, f.vaultId, hash, bytes)).toThrow("Unreferenced");
    expect(put.mock.calls).toHaveLength(0);
    headers.mockReturnValue([stored]);
    const withoutPut = { ...f.storage };
    const unavailable: IAppOptions = { ...f.options };
    const storage: IStorageAdapter = withoutPut;
    delete storage.putFileList;
    unavailable.storage = storage;
    expect(() => restoreFiles(unavailable, f.vaultId, hash, bytes)).toThrow("unavailable");

    for (const position of ["none", "current", "previous"] as const) {
      const permanent = {
        ...stored,
        bytes: p.signedCodec(p.ManifestHeaderCodec).write(
          f.next(f.create.header, {
            op: 11,
            filesHash: position === "current" ? hash : p.randomBytes(32),
          }).header,
        ),
      };

      headers.mockReturnValue(
        position === "none" ? [stored] : position === "current" ? [permanent] : [stored, permanent],
      );

      expect(restoreFiles(f.options, f.vaultId, hash, bytes)).toEqual({ kind: "uploaded" });

      expect(put.mock.calls.at(-1)).toEqual([
        f.vaultId,
        {
          hash,
          bytes,
          retainForever: position !== "none",
          versions: [
            {
              fileId: p.decode(p.FilesCodec, bytes).entries[0]!.fileId,
              version: 2n,
              tombstone: false,
              blobHash: p.decode(p.FilesCodec, bytes).entries[0]!.blobHash,
            },
          ],
        },
        f.options.now(),
      ]);

      expect(f.storage.fileList(f.vaultId, hash)).toEqual(bytes);
    }
  } finally {
    headers.mockRestore();
    put.mockRestore();
    f.close();
  }
});
