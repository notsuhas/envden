import { accessSync, constants, existsSync, realpathSync, statSync, type Stats } from "node:fs";
import { dirname, isAbsolute, join, parse } from "node:path";
import { EnvdenError } from "../errors/index.ts";

import { fixedDirectories, managerRoots } from "./directories.ts";
import { insideUntrustedRoot } from "./roots.ts";

export function insideWorkingTree(path: string, exceptions = managerRoots()): boolean {
  if (insideUntrustedRoot(path)) return true;
  let directory = path;

  while (true) {
    if (existsSync(join(directory, ".git")) && !exceptions.includes(directory)) return true;
    const parent = dirname(directory);
    if (parent === directory) return false;
    directory = parent;
  }
}

function trustedDirectory(path: string): boolean {
  if (!isAbsolute(path)) return false;

  try {
    const canonical = realpathSync(path);
    if (insideWorkingTree(path) || insideWorkingTree(canonical)) return false;
    const info = statSync(canonical);

    return info.isDirectory() && trustedOwnerAndMode(info);
  } catch {
    return false;
  }
}

export function trustedDirectories(
  directories = fixedDirectories(),
  managerBin?: string,
): string[] {
  return [...new Set([...directories, ...(managerBin ? [managerBin] : [])])].filter(
    trustedDirectory,
  );
}

export function resolveTrustedExecutable(name: string): string {
  const candidates = isAbsolute(name)
    ? [name]
    : trustedDirectories().flatMap((dir) =>
        (process.platform === "win32" && !parse(name).ext
          ? [name, `${name}.exe`, `${name}.com`]
          : [name]
        ).map((file) => join(dir, file)),
      );

  for (const candidate of candidates) {
    if (!isAbsolute(name) && parse(name).base !== name) break;

    try {
      const real = realpathSync(candidate);
      const info = statSync(real);
      if (!trustedDirectory(dirname(candidate)) || !trustedDirectory(dirname(real))) continue;

      if (!info.isFile() || !trustedOwnerAndMode(info)) continue;

      accessSync(real, constants.X_OK);

      return real;
    } catch {
      continue;
    }
  }

  throw new EnvdenError("INVALID_INPUT", "Trusted executable unavailable");
}

export function trustedOwnerAndMode(
  info: Pick<Stats, "mode" | "uid" | "gid">,
  platform = process.platform,
): boolean {
  if (platform === "win32") return true;
  if ((info.mode & 0o002) !== 0) return false;

  if ((info.mode & 0o020) !== 0 && info.gid !== 0 && !(platform === "darwin" && info.gid === 80))
    return false;

  return info.uid === 0 || info.uid === process.getuid?.();
}
