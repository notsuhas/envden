import { validatePath } from "@envden/core/protocol";

export function validatePulledPath(path: string): string {
  validatePath(path);

  if (path.split("/").some((part) => part.toLowerCase() === ".git"))
    throw new Error("Unsafe pulled path");

  return path;
}
