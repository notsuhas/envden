import { Glob } from "bun";
import type { IEnvFileRules } from "./repo.ts";

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

export function acceptsEnvPath(path: string, options: IEnvFileRules = {}) {
  const parts = path.split("/");
  const name = parts.at(-1)!;

  const skip = new Set([
    ...skipped,
    ...(options.extraSkipped ?? []).map((part) => part.toLowerCase()),
  ]);

  return (
    !parts.slice(0, -1).some((part) => skip.has(part.toLowerCase())) &&
    name.toLowerCase() !== ".envrc" &&
    (options.include ? matches(options.include, path, name) : /^\.env(?:\..+)?$/.test(name)) &&
    !(options.exclude
      ? matches(options.exclude, path, name)
      : /\.(example|sample|template|defaults)$/.test(name))
  );
}

function matches(patterns: string[], path: string, name: string) {
  return patterns.some((pattern) => new Glob(pattern).match(pattern.includes("/") ? path : name));
}
