import { basePath, readBytes, writeBytes } from "../../files.ts";

export async function deletionRequested(home: string, store: string) {
  return (await readBytes(basePath(home, store) + ".delete")) !== undefined;
}

export async function requestDeletion(home: string, store: string, requested: boolean) {
  await writeBytes(basePath(home, store) + ".delete", requested ? new Uint8Array([1]) : undefined);
}
