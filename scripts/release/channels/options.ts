import { validateVersion } from "./render.ts";

export function parseArguments(args: readonly string[]) {
  const [input, ...flags] = args;

  if (!input || flags.some((flag) => flag !== "--dry-run") || flags.length > 1) {
    throw new Error("Usage: bun scripts/release/publish-channels.ts <version> [--dry-run]");
  }

  return { version: validateVersion(input), dryRun: flags.includes("--dry-run") };
}

export function publicationAction(dryRun: boolean, diff: string) {
  if (dryRun) return "preview";

  return diff.trim() ? "publish" : "unchanged";
}

export function repositoryFiles(file: string, readme: string | undefined, readmeExists: boolean) {
  return readme !== undefined && !readmeExists ? [file, "README.md"] : [file];
}

export function isMissingFile(error: unknown) {
  if (!(error instanceof Error)) return false;
  if (!("code" in error)) return false;

  return error.code === "ENOENT";
}
