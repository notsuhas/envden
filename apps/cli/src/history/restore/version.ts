import { EnvdenError } from "@envden/core/errors";

export function parseVersion(value: string) {
  const match = /^v?([1-9][0-9]{0,15})$/.exec(value.trim());
  if (!match) throw new EnvdenError("INVALID_INPUT", "Version must be a number such as 3 or v3");

  return Number(match[1]);
}
