import { EnvdenError } from "@envden/core/errors";

export function shellFailure(cause: unknown): never {
  if (cause instanceof EnvdenError) throw cause;

  throw new EnvdenError("INTERNAL", "Shell configuration operation failed", { cause });
}
