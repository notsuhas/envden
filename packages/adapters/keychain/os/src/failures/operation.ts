import { EnvdenError } from "@envden/core/errors";
import { keychainAdvice } from "./advice.ts";

export function keychainFailure(cause: unknown): never {
  if (cause instanceof EnvdenError) throw cause;

  throw new EnvdenError(
    "LOCKED",
    keychainAdvice(cause, process.platform) ?? "Key storage operation failed",
    {
      cause,
    },
  );
}
