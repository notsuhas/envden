import type { Dirent } from "node:fs";
import { gitSession } from "../exec/git.ts";
import type { ICheckout, IEnvFileRules } from "@envden/core/adapters";
import { acceptsEnvPath } from "@envden/core/adapters";
import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { caseInsensitive } from "../checkout/case.ts";
import { validatePath } from "./validate-path.ts";
import { exitCode } from "../failures/exit-code.ts";
import { EnvdenError } from "@envden/core/errors";

// a symlinked env file is listed too; the caller decides whether envden owns it
export async function envFiles(
  checkout: ICheckout,
  options: IEnvFileRules = {},
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
  await walk(checkout, "", options, submodules, files);
  const candidates = files.filter((path) => !tracked.has(key(path)));
  if (!candidates.length) return [];

  try {
    return (await git(["check-ignore", "--stdin", "-z"], candidates.join("\0") + "\0"))
      .split("\0")
      .filter(Boolean)
      .sort();
  } catch (error) {
    if (exitCode(error) === 1) return [];

    throw error;
  }
}

async function walk(
  checkout: ICheckout,
  dir: string,
  options: IEnvFileRules,
  submodules: string[],
  files: string[],
): Promise<void> {
  const entries = await readableEntries(checkout.root, dir);
  if (nestedClone(dir, entries)) return;

  for (const entry of entries) {
    const path = dir ? `${dir}/${entry.name}` : entry.name;
    if (submodules.includes(path) || !encodable(path)) continue;

    if (entry.isDirectory()) {
      if (descends(path, options)) await walk(checkout, path, options, submodules, files);
    } else if (candidate(entry, path, options)) files.push(path);
  }
}

function descends(path: string, options: IEnvFileRules) {
  return acceptsEnvPath(`${path}/.env`, { extraSkipped: options.extraSkipped ?? [] });
}

// a nested clone is its own repo (often vendored code), so its env files aren't this checkout's
function nestedClone(dir: string, entries: Dirent[]) {
  return !!dir && entries.some((entry) => entry.name === ".git");
}

function candidate(entry: Dirent, path: string, options: IEnvFileRules) {
  return (entry.isFile() || entry.isSymbolicLink()) && acceptsEnvPath(path, options);
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
