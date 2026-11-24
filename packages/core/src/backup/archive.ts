import { packTar } from "modern-tar";
import { EnvdenError } from "../errors/index.ts";

export interface IBackupFile {
  name: string;
  bytes: Uint8Array;
}

export async function packBackup(files: readonly IBackupFile[], time: number): Promise<Uint8Array> {
  const mtime = new Date(time);
  const names = new Set(files.map((file) => file.name));
  const folders = [...new Set(files.flatMap((file) => parents(file.name)))].sort();

  if (names.size !== files.length || folders.some((folder) => names.has(folder)))
    throw new EnvdenError("INVALID_INPUT", "Two backup files have the same name");

  return packTar([
    ...folders.map((folder) => ({
      header: { name: `${folder}/`, type: "directory" as const, size: 0, mode: 0o700, mtime },
    })),
    ...files.map((file) => ({
      header: { name: file.name, size: file.bytes.length, mode: 0o600, mtime },
      body: file.bytes,
    })),
  ]);
}

function parents(name: string): string[] {
  const parts = name.split("/");

  if (parts.some((part) => part === "" || part === "." || part === ".."))
    throw new EnvdenError("INVALID_INPUT", "Unsafe backup file name");

  return parts.slice(1).map((_, index) => parts.slice(0, index + 1).join("/"));
}
