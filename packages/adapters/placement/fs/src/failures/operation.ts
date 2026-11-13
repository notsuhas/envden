import { EnvdenError } from "@envden/core/errors";

export function placementFailure(cause: unknown): never {
  if (cause instanceof EnvdenError) throw cause;

  throw new EnvdenError("CONFLICT", "Placement operation failed", { cause });
}
