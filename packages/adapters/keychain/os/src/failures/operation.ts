import { EnvdenError } from "@envden/core/errors";

export function keychainFailure(cause: unknown): never {
  if (cause instanceof EnvdenError) throw cause;

  throw new EnvdenError("LOCKED", "Key storage operation failed", { cause });
}
