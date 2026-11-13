import { createSqliteStorageAdapter } from "@envden/adapter-storage-sqlite";

export function createAdapters(dataDir: string, now: number) {
  return { storage: createSqliteStorageAdapter(dataDir, now) };
}
