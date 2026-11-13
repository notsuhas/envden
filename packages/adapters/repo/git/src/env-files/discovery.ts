import type { Dirent } from "node:fs";
import type { ICheckout } from "@envden/core/adapters";
import { Glob } from "bun";
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
  options: { include?: string[]; exclude?: string[]; extraSkipped?: string[] } = {},
): Promise<string[]> {
  const skip = new Set([...skipped, ...(options.extraSkipped ?? [])]);
  const files: string[] = [];

  async function walk(dir: string): Promise<void> {
    for (const entry of await readdir(resolve(checkout.root, dir), { withFileTypes: true })) {
      const path = dir ? `${dir}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        if (!skip.has(entry.name)) await walk(path);
        continue;
      }

      if (!isEnvFile(entry, path, options)) continue;

      if (await tracked(checkout, path)) continue;
      if (await isIgnored(checkout, path)) files.push(path);
    }
  }

  await walk("");

  return files.sort();
}

function isEnvFile(
  entry: Dirent,
  path: string,
  options: { include?: string[]; exclude?: string[] },
) {
  return (
    (entry.isFile() || entry.isSymbolicLink()) &&
    entry.name !== ".envrc" &&
    (options.include
      ? matches(options.include, path, entry.name)
      : /^\.env(?:\..+)?$/.test(entry.name)) &&
    !(options.exclude
      ? matches(options.exclude, path, entry.name)
      : /\.(example|sample|template|defaults)$/.test(entry.name))
  );
}

function matches(patterns: string[], path: string, name: string) {
  return patterns.some((pattern) => new Glob(pattern).match(pattern.includes("/") ? path : name));
}
