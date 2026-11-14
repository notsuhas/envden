import { EnvdenError } from "@envden/core/errors";
import { validatePath } from "@envden/core/protocol";

export function validatePulledPath(path: string): string {
  if (/\p{Cf}/u.test(path)) throw new EnvdenError("INVALID_INPUT", "Unsafe pulled path");

  return validateLocalPath(path);
}

export function validateLocalPath(path: string): string {
  validatePath(path);

  if (path.split("/").some((part) => part.toLowerCase() === ".git" || /~[0-9]+(?:\.|$)/.test(part)))
    throw new EnvdenError("INVALID_INPUT", "Unsafe pulled path");

  return path;
}
