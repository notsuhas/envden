import { readBytes, same, writeBytes } from "../files.ts";

export async function saveBase(base: string, content: Uint8Array | undefined) {
  if (!same(await readBytes(base), content)) await writeBytes(base, content);
}
