import { lstat, realpath } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, sep } from "node:path";
import { EnvdenError } from "@envden/core/errors";

export async function parentIdentity(root: string, destination: string) {
  const realRoot = await realpath(root);
  const path = relative(root, dirname(destination));
  const parents = [];
  let current = root;

  for (const part of ["", ...path.split(sep).filter(Boolean)]) {
    current = join(current, part);
    const stat = await lstat(current);

    if (!stat.isDirectory() || stat.isSymbolicLink())
      throw new EnvdenError("CONFLICT", "Unsafe checkout parent");

    parents.push({ path: current, dev: stat.dev, ino: stat.ino });
  }

  return { realRoot, parents };
}

export async function verifyParents(
  snapshot: Awaited<ReturnType<typeof parentIdentity>>,
  destination: string,
) {
  for (const parent of snapshot.parents) {
    const stat = await lstat(parent.path);

    if (
      !stat.isDirectory() ||
      stat.isSymbolicLink() ||
      stat.dev !== parent.dev ||
      stat.ino !== parent.ino
    )
      throw new EnvdenError("CONFLICT", "Checkout parent changed");
  }

  const path = relative(snapshot.realRoot, await realpath(dirname(destination)));

  if (path === ".." || path.startsWith(`..${sep}`) || isAbsolute(path))
    throw new EnvdenError("CONFLICT", "Checkout parent escaped root");
}
