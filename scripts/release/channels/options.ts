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
