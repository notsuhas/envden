import { lstat, open, rm } from "node:fs/promises";
import { join } from "node:path";

export async function caseInsensitive(root: string): Promise<boolean> {
  const name = `.envden-case-${crypto.randomUUID()}`;
  const path = join(root, name);
  const file = await open(path, "wx", 0o600);

  try {
    const original = await file.stat();

    const alternate = await lstat(join(root, name.toUpperCase())).catch((cause) => {
      if (cause instanceof Error && "code" in cause && cause.code === "ENOENT") return undefined;
      throw cause;
    });

    return alternate?.dev === original.dev && alternate?.ino === original.ino;
  } finally {
    await file.close();
    await rm(path, { force: true });
  }
}
