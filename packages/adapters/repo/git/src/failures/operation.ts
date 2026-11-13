import { EnvdenError } from "@envden/core/errors";

export function repoFailure(cause: unknown): never {
  if (cause instanceof EnvdenError) throw cause;

  throw new EnvdenError("INTERNAL", "Repository operation failed", { cause });
}
