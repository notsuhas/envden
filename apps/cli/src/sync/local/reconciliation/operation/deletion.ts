import { optionalRead, atomicWrite } from "../../../../state/store/files.ts";
import { basePath, readBytes, writeBytes } from "../../files.ts";

export async function deletionRequested(home: string, store: string) {
  return (await readBytes(basePath(home, store) + ".delete")) !== undefined;
}

export async function requestDeletion(
  home: string,
  store: string,
  requested: boolean,
  entry?: string,
) {
  const path = basePath(home, store) + ".delete";

  if (!requested) {
    await writeBytes(path, undefined);

    return;
  }

  const ancestor = entry ?? (await optionalRead(basePath(home, store) + ".entry"));
  if (ancestor) await atomicWrite(path, ancestor);
}
