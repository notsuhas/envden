import type { Dirent } from "node:fs";
import { gitSession } from "../exec/git.ts";
import type { ICheckout, IEnvFileRules } from "@envden/core/adapters";
import { acceptsEnvPath } from "@envden/core/adapters";
import { readdir, lstat, readlink, realpath } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { placeInRoot } from "@envden/core/paths";
import { caseInsensitive } from "../checkout/case.ts";
import { validatePath } from "./validate-path.ts";
import { EnvdenError } from "@envden/core/errors";

export async function envFiles(
  checkout: ICheckout,
  options: IEnvFileRules = {},
  storeRoot?: string,
): Promise<string[]> {
  const files: string[] = [];

  const git = await gitSession(checkout.root);
  const insensitive = await caseInsensitive(checkout.root);

  const key = (path: string) =>
    insensitive ? path.normalize("NFC").toLowerCase() : path.normalize("NFC");

  const entries = (await git(["ls-files", "--stage", "-z"])).split("\0").filter(Boolean);

  const submodules = entries
    .filter((line) => line.startsWith("160000 "))
    .map((line) => line.slice(line.indexOf("\t") + 1));

  const tracked = new Set(entries.map((line) => key(line.slice(line.indexOf("\t") + 1))));
  await walk(checkout, "", options, storeRoot, submodules, files);
  const candidates = files.filter((path) => !tracked.has(key(path)));
  if (!candidates.length) return [];

  try {
    return (await git(["check-ignore", "--stdin", "-z"], candidates.join("\0") + "\0"))
      .split("\0")
      .filter(Boolean)
      .sort();
  } catch (error) {
    if (
      error instanceof EnvdenError &&
      error.cause &&
      typeof error.cause === "object" &&
      "exitCode" in error.cause &&
      error.cause.exitCode === 1
    )
      return [];

    throw error;
  }
}

async function walk(
  checkout: ICheckout,
  dir: string,
  options: IEnvFileRules,
  storeRoot: string | undefined,
  submodules: string[],
  files: string[],
): Promise<void> {
  const entries = await readableEntries(checkout.root, dir);

  for (const entry of entries) {
    const path = dir ? `${dir}/${entry.name}` : entry.name;
    if (submodules.includes(path)) continue;

    if (!encodable(path)) continue;

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
  const text = await readlink(path);
  if (storeRoot && (await inStore(storeRoot, resolve(dirname(path), text)))) return true;

  console.error(
    `envden: skipped ${JSON.stringify(path)}: it links to ${JSON.stringify(text)}, and envden only syncs files it owns`,
  );

  return false;
}

// the link text may go through a symlinked ENVDEN_HOME, so also compare real paths
async function inStore(storeRoot: string, target: string) {
  if (placeInRoot(storeRoot, target) === "inside") return true;
  const [root, real] = await Promise.all([realpath(storeRoot), realpath(target)]).catch(() => []);

  return !!root && !!real && placeInRoot(root, real) === "inside";
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
    candidate(entry, path, options) && (await discoverable(resolve(checkout.root, path), storeRoot))
  );
}

function unreadable(error: unknown) {
  return (
    error instanceof Error && "code" in error && (error.code === "EACCES" || error.code === "EPERM")
  );
}

async function readableEntries(root: string, dir: string): Promise<Dirent[]> {
  try {
    return await readdir(resolve(root, dir), { withFileTypes: true });
  } catch (error) {
    if (dir && unreadable(error)) return [];
    throw error;
  }
}

function encodable(path: string) {
  try {
    validatePath(path);

    return true;
  } catch (error) {
    if (error instanceof EnvdenError && error.code === "INVALID_DATA") return false;
    throw error;
  }
}
