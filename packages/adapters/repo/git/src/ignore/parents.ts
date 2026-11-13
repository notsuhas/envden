import { lstat, mkdir, realpath } from "node:fs/promises";
import { dirname, relative, isAbsolute, join, sep } from "node:path";
import { EnvdenError } from "@envden/core/errors";

export async function excludeParents(gitDir: string, exclude: string) {
  const common = await realpath(gitDir);
  const parent = relative(common, dirname(exclude));

  if (parent === ".." || parent.startsWith(`..${sep}`) || isAbsolute(parent))
    throw new EnvdenError("INVALID_INPUT", "Exclude path escapes git directory");

  const parents = [];
  let current = common;

  for (const part of ["", ...parent.split(/[\\/]/).filter(Boolean)]) {
    current = join(current, part);

    try {
      await mkdir(current, { mode: 0o700 });
    } catch (error) {
      if (!(error && typeof error === "object" && "code" in error && error.code === "EEXIST"))
        throw error;
    }

    const stat = await lstat(current);
    parents.push({ path: current, dev: stat.dev, ino: stat.ino });

    if (!stat.isDirectory() || stat.isSymbolicLink())
      throw new EnvdenError("INVALID_INPUT", "Unsafe exclude parent");
  }

  return parents;
}

export async function verifyExcludeParents(parents: Awaited<ReturnType<typeof excludeParents>>) {
  await Promise.all(
    parents.map(async (parent) => {
      if ((await realpath(parent.path)) !== parent.path)
        throw new EnvdenError("CONFLICT", "Exclude parent changed");

      const current = await lstat(parent.path);

      const sameDirectory =
        current.isDirectory() && current.dev === parent.dev && current.ino === parent.ino;

      if (!sameDirectory) throw new EnvdenError("CONFLICT", "Exclude parent changed");
    }),
  );
}
