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

test("swap quota includes files and rolls back the head", () => {
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
          files: { hash, bytes: hash, versions: [] },
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

test("expired charges and strikes are pruned across caller-selected buckets", () => {
  const dir = temp();
  const storage = createSqliteStorageAdapter(dir, 0);
  const db = new Database(join(dir, "envden.sqlite"));

  try {
    for (let i = 0; i < 100; i++) {
      const device = new Uint8Array([i]);
      for (let j = 0; j < 20; j++) storage.charge(device, { kind: "mailbox", device }, 0);
    }

    storage.charge(new Uint8Array([255]), { kind: "mailbox" }, 30 * 86400000);
    expect(db.query("SELECT COUNT(*) AS count FROM charges").get()).toEqual({ count: 1 });
    expect(db.query("SELECT COUNT(*) AS count FROM buckets").get()).toEqual({ count: 0 });
  } finally {
    db.close();
    storage.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

for (const operation of ["remove", "rotate", "files", "blob", "move", "repair"] as const)
  test(`over-quota vault: ${operation}`, () => {
    const dir = temp();
    const storage = createSqliteStorageAdapter(dir, 0);
    const vault = new Uint8Array([1]);
    const hash = new Uint8Array([2]);

    storage.configureVault(vault, {
      active: true,
      frozen: false,
      skRefused: false,
      unlockPeriod: null,
    });

    storage.putBlob(vault, hash, hash);
    const db = new Database(join(dir, "envden.sqlite"));
    db.run("UPDATE blob_usage SET size=1073741825");

    try {
      const imported = operation === "move" || operation === "repair";

      if (imported)
        storage.configureVault(vault, {
          ...storage.vault(vault)!,
          active: operation !== "move",
          ...(operation === "repair"
            ? { restored: { repairTokenHash: hash, restoredHead: hash } }
            : {}),
        });

      const commit = () =>
        storage.commitSwap(
          vault,
          undefined,
          {
            header: { seq: 1n, hash, bytes: hash },
            entries: [],
            bodyDigest: hash,
            ...(operation === "files" || imported
              ? { files: { hash, bytes: hash, versions: [] } }
              : {}),
            ...(operation === "rotate"
              ? { state: [{ kind: "keyring" as const, key: hash, bytes: hash }] }
              : {}),
            ...(operation === "remove"
              ? {
                  devices: [
                    {
                      id: hash,
                      state: { unlockedUntil: 0, freshUntil: 0, clientVersion: "1.0.0" },
                    },
                  ],
                }
              : {}),
          },
          0,
        );

      if (operation === "files")
        expect(commit).toThrow(expect.objectContaining({ code: "STORAGE_QUOTA" }));
      else if (operation === "blob")
        expect(() => storage.putBlob(vault, new Uint8Array([3]), hash)).toThrow(
          expect.objectContaining({ code: "STORAGE_QUOTA" }),
        );
      else {
        expect(commit().kind).toBe("committed");

        if (imported) {
          storage.putFileList!(vault, { hash: new Uint8Array([4]), bytes: hash, versions: [] }, 0);
          storage.putBlob(vault, new Uint8Array([5]), hash);
        }

        expect(storage.head(vault)).toEqual(hash);
        storage.putBlob(vault, hash, hash);
      }
    } finally {
      db.close();
      storage.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
