import { caseProbe } from "./case-probe.ts";
import { EnvdenError } from "@envden/core/errors";
import { lstat, open, rm, readdir } from "node:fs/promises";
import { join } from "node:path";

export async function caseInsensitive(root: string, readOnly = false): Promise<boolean> {
  const probe = caseProbe(await readdir(root));
  if (probe.kind === "sensitive") return false;

  if (probe.kind === "compare") {
    const original = await lstat(join(root, probe.name));
    const alternate = await lstat(join(root, probe.alternate)).catch(missing);

    return alternate?.dev === original.dev && alternate?.ino === original.ino;
  }

  if (readOnly)
    throw new EnvdenError("NOT_IMPLEMENTED", "Filesystem case behavior requires a writable probe");

  return writableProbe(root);
}

async function writableProbe(root: string) {
  const name = `.envden-case-${crypto.randomUUID()}`;
  const path = join(root, name);
  const file = await open(path, "wx", 0o600);

  try {
    const original = await file.stat();

    const alternate = await lstat(join(root, name.toUpperCase())).catch(missing);

    return alternate?.dev === original.dev && alternate?.ino === original.ino;
  } finally {
    await file.close();
    await rm(path, { force: true });
  }
}

function missing(cause: unknown): undefined {
  if (cause instanceof Error && "code" in cause && cause.code === "ENOENT") return undefined;
  throw cause;
}
