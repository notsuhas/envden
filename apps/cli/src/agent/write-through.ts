import { lstat, mkdir, readlink, realpath } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { EnvdenError } from "@envden/core/errors";
import { atomicWrite } from "../state/store/files.ts";

const MAX_LINKS = 40;

// User files often link into a dotfiles repo; replace the target and keep the link
export async function writeThrough(
  path: string,
  bytes: string | Uint8Array,
  now: () => number,
): Promise<void> {
  await atomicWrite(await linkTarget(path), bytes, now);
}

async function linkTarget(path: string): Promise<string> {
  let current = resolve(path);

  for (let hops = 0; hops < MAX_LINKS; hops++) {
    const real = await realpath(current).catch(missing);

    if (real !== undefined) return real;

    const stat = await lstat(current).catch(missing);

    if (!stat?.isSymbolicLink()) {
      await mkdir(dirname(current), { recursive: true });

      return join(await realpath(dirname(current)), basename(current));
    }

    current = resolve(dirname(current), await readlink(current));
  }

  throw new EnvdenError("INVALID_INPUT", "Too many symbolic links");
}

function missing(cause: unknown): undefined {
  if (cause instanceof Error && "code" in cause && cause.code === "ENOENT") return undefined;
  throw cause;
}
