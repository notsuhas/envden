import { expect } from "bun:test";
import type { IStorageAdapter } from "@envden/core/adapters";

export function blobStagingContract(db: IStorageAdapter) {
  const b = (value: number) => new Uint8Array([value]);
  db.configureVault(b(1), { active: true, frozen: false, skRefused: false, unlockPeriod: null });
  db.putBlob(b(1), b(80), b(81), undefined, 10, 1);
  expect(db.hasBlob(b(1), b(80))).toBe(true);

  expect(() => db.putBlob(b(1), b(82), b(83), undefined, 10, 1)).toThrow(
    expect.objectContaining({ code: "STORAGE_QUOTA" }),
  );

  expect(db.prune(b(1), { maxAge: 0, minVersions: 1 }, 86400010).blobs).toBe(0);
  db.putBlob(b(1), b(80), b(81), undefined, 86400010, 1);
  expect(db.prune(b(1), { maxAge: 0, minVersions: 1 }, 86400011).blobs).toBe(0);
  expect(db.prune(b(1), { maxAge: 0, minVersions: 1 }, 172800011).blobs).toBe(1);
  expect(db.hasBlob(b(1), b(80))).toBe(false);
}
