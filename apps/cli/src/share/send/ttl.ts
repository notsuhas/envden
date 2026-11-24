import { EnvdenError } from "@envden/core/errors";

export function shareMinutes(value: string): number {
  const minutes = Number(value);

  if (!/^\d+$/.test(value) || minutes < 1 || minutes > 60)
    throw new EnvdenError("INVALID_INPUT", "--ttl takes whole minutes from 1 to 60");

  return minutes;
}
