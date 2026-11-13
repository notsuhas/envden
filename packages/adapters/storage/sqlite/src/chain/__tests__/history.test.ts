import { expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSqliteStorageAdapter } from "../../index.ts";

const b = (value: number) => new Uint8Array([value]);

test("unchanged file versions do not pin every historical list", () => {
  const dir = mkdtempSync(join(tmpdir(), "envden-history-"));
  const db = createSqliteStorageAdapter(dir, 0);

  try {
    for (let i = 1; i <= 3; i++) {
      db.putBlob(b(1), b(i), b(i));

      db.commitSwap(
        b(1),
        i === 1 ? undefined : b(i - 1),
        {
          header: { seq: BigInt(i), hash: b(i), bytes: b(i) },
          entries: [],
          bodyDigest: b(i),
          vault: { active: true, frozen: false, skRefused: false, unlockPeriod: null },
          files: {
            hash: b(i),
            bytes: b(i),
            versions: [
              { fileId: b(1), version: 1n, tombstone: false, blobHash: b(1) },
              { fileId: b(2), version: BigInt(i), tombstone: false, blobHash: b(i) },
            ],
          },
        },
        i,
      );
    }

    expect(db.prune(b(1), { maxAge: 0, minVersions: 1 }, 4)).toEqual({ lists: 1, blobs: 1 });
    expect(db.fileList(b(1), b(2))).toBeUndefined();
    expect(existsSync(join(dir, "blobs", "01", "02"))).toBe(false);
    expect(db.getBlob(b(1), b(1))).toEqual(b(1));

    expect(() => db.transaction(() => db.prune(b(1), { maxAge: 0, minVersions: 1 }, 4))).toThrow(
      "outside",
    );
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("restored current list stays pinned after a header imported without its body", () => {
  const dir = mkdtempSync(join(tmpdir(), "envden-import-history-"));
  const db = createSqliteStorageAdapter(dir, 0);

  try {
    db.commitSwap(
      b(1),
      undefined,
      {
        header: { seq: 1n, hash: b(1), bytes: b(1) },
        entries: [],
        bodyDigest: b(1),
        vault: { active: true, frozen: false, skRefused: false, unlockPeriod: null },
        files: {
          hash: b(1),
          bytes: b(1),
          versions: [{ fileId: b(1), version: 1n, tombstone: false, blobHash: b(1) }],
        },
      },
      1,
    );

    db.commitSwap(
      b(1),
      b(1),
      {
        header: { seq: 2n, hash: b(2), bytes: b(2) },
        entries: [],
        bodyDigest: b(2),
        filesHash: b(2),
      },
      2,
    );

    if (!db.putFileList) throw new Error("Missing list restoration capability");

    db.putFileList(
      b(1),
      {
        hash: b(2),
        bytes: b(2),
        versions: [{ fileId: b(1), version: 2n, tombstone: false, blobHash: b(2) }],
      },
      2,
    );

    expect(db.prune(b(1), { maxAge: 0, minVersions: 1 }, 4).lists).toBe(1);
    expect(db.fileList(b(1), b(1))).toBeUndefined();
    expect(db.fileList(b(1), b(2))).toEqual(b(2));
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
