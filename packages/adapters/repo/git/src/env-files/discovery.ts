import type { Dirent } from "node:fs";
import { git } from "../exec/git.ts";
import type { ICheckout, IEnvFileRules } from "@envden/core/adapters";
import { acceptsEnvPath } from "@envden/core/adapters";
import { readdir, lstat, readlink } from "node:fs/promises";
import { resolve, dirname, relative } from "node:path";
import { tracked } from "./tracked.ts";
import { isIgnored } from "../ignore/is-ignored.ts";

export async function envFiles(
  checkout: ICheckout,
  options: IEnvFileRules = {},
  storeRoot?: string,
): Promise<string[]> {
  const files: string[] = [];

  const submodules = (await git(checkout.root, ["ls-files", "--stage", "-z"]))
    .split("\0")
    .filter((line) => line.startsWith("160000 "))
    .map((line) => line.slice(line.indexOf("\t") + 1));

  await walk(checkout, "", options, storeRoot, submodules, files);

  return files.sort();
}

async function walk(
  checkout: ICheckout,
  dir: string,
  options: IEnvFileRules,
  storeRoot: string | undefined,
  submodules: string[],
  files: string[],
): Promise<void> {
  for (const entry of await readdir(resolve(checkout.root, dir), { withFileTypes: true })) {
    const path = dir ? `${dir}/${entry.name}` : entry.name;
    if (submodules.includes(path)) continue;

    if (entry.isDirectory()) {
      if (acceptsEnvPath(`${path}/.env`, { extraSkipped: options.extraSkipped ?? [] }))
        await walk(checkout, path, options, storeRoot, submodules, files);

      continue;
    }

    if (await includesFile(checkout, entry, path, options, storeRoot)) files.push(path);
  }
}

async function discoverable(path: string, storeRoot?: string) {
  if (!(await lstat(path)).isSymbolicLink()) return true;
  const target = resolve(dirname(path), await readlink(path));
  const rel = storeRoot ? relative(storeRoot, target) : undefined;
  if (rel && !rel.startsWith("..") && rel !== target) return true;
  console.error(`envden: skipped symlink ${JSON.stringify(path)}`);

  return false;
}

function candidate(entry: Dirent, path: string, options: IEnvFileRules) {
  return (entry.isFile() || entry.isSymbolicLink()) && acceptsEnvPath(path, options);
}

async function includesFile(
  checkout: ICheckout,
  entry: Dirent,
  path: string,
  options: IEnvFileRules,
  storeRoot?: string,
) {
  return (
    candidate(entry, path, options) &&
    (await discoverable(resolve(checkout.root, path), storeRoot)) &&
    !(await tracked(checkout, path)) &&
    (await isIgnored(checkout, path))
  );
}
