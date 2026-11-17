import { EnvdenError } from "@envden/core/errors";

export function parseVersion(value: string) {
  const match = /^v?([1-9][0-9]{0,15})$/.exec(value.trim());
  const version = match ? Number(match[1]) : 0;

  if (!Number.isSafeInteger(version) || version < 1)
    throw new EnvdenError("INVALID_INPUT", "Version must be a number such as 3 or v3");

  return version;
}
