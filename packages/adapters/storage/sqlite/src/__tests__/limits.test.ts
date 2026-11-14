import { test, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createSqliteStorageAdapter } from "../index.ts";

function temp() {
  return mkdtempSync(join(tmpdir(), "envden-limits-"));
}

for (const refund of [false, true])
  test(`rate strikes reset after ${refund ? "success" : "a quiet period"}`, () => {
    const dir = temp();
    const storage = createSqliteStorageAdapter(dir, 0);
    const vault = new Uint8Array([1]);
    const bucket = { kind: "non-member" } as const;

    try {
      let receipt = "";

      for (let i = 0; i < 5; i++) {
        const charge = storage.charge(vault, bucket, 0);
        if (charge.kind === "charged") receipt = charge.receipt;
      }

      if (refund) expect(storage.refund(receipt, 1)).toBe(true);
      const now = refund ? 900001 : 30 * 86400000;
      for (let i = 0; i < 5; i++) storage.charge(vault, bucket, now);
      expect(storage.charge(vault, bucket, now)).toEqual({ kind: "locked", until: now + 900000 });
    } finally {
      storage.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

for (const material of ["files", "keyring"] as const)
  test(`swap quota includes ${material} and rolls back the head`, () => {
    const dir = temp();
    const storage = createSqliteStorageAdapter(dir, 0);
    const vault = new Uint8Array([1]);
    const hash = new Uint8Array([2]);
    storage.putBlob(vault, hash, new Uint8Array([3]));
    const db = new Database(join(dir, "envden.sqlite"));
    db.run("UPDATE blob_usage SET size=1073741824");

    try {
      expect(() =>
        storage.commitSwap(
          vault,
          undefined,
          {
            header: { seq: 1n, hash, bytes: hash },
            entries: [],
            bodyDigest: hash,
            vault: { active: true, frozen: false, skRefused: false, unlockPeriod: null },
            ...(material === "files"
              ? { files: { hash, bytes: hash, versions: [] } }
              : { state: [{ kind: "keyring", key: hash, bytes: hash }] }),
          },
          0,
        ),
      ).toThrow(expect.objectContaining({ code: "STORAGE_QUOTA" }));

      expect(storage.head(vault)).toBeUndefined();
      expect(storage.hasVault(vault)).toBe(false);
    } finally {
      db.close();
      storage.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
