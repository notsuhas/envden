import type { Dirent } from "node:fs";
import type { ICheckout } from "@envden/core/adapters";
import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { tracked } from "./tracked.ts";
import { isIgnored } from "../ignore/is-ignored.ts";

const skipped = new Set([
  ".git",
  "node_modules",
  ".next",
  "dist",
  "build",
  "out",
  "coverage",
  ".turbo",
  ".cache",
  "vendor",
]);

export async function envFiles(
  checkout: ICheckout,
  extraSkipped: string[] = [],
): Promise<string[]> {
  const skip = new Set([...skipped, ...extraSkipped]);
  const files: string[] = [];

  async function walk(dir: string): Promise<void> {
    for (const entry of await readdir(resolve(checkout.root, dir), { withFileTypes: true })) {
      const path = dir ? `${dir}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        if (!skip.has(entry.name)) await walk(path);
        continue;
      }

      if (!isEnvFile(entry)) continue;

      if (await tracked(checkout, path)) continue;
      if (await isIgnored(checkout, path)) files.push(path);
    }
  }

  await walk("");

  return files.sort();
}

function isEnvFile(entry: Dirent) {
  return (
    (entry.isFile() || entry.isSymbolicLink()) &&
    /^\.env(?:\..+)?$/.test(entry.name) &&
    !/\.(example|sample|template|defaults)$/.test(entry.name)
  );
}
