import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { storageContract } from "@envden/testing/storage";
import { createSqliteStorageAdapter } from "../index.ts";

storageContract("SQLite storage contract", () => {
  const dir = mkdtempSync(join(tmpdir(), "envden-contract-sqlite-"));
  let storage = createSqliteStorageAdapter(dir, 0);

  return {
    storage,
    reopen() {
      storage.close();
      storage = createSqliteStorageAdapter(dir, 0);

      return storage;
    },
    dispose() {
      storage.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
});
