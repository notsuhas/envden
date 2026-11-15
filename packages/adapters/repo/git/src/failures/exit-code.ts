import { EnvdenError } from "@envden/core/errors";

export function exitCode(error: unknown): number | undefined {
  if (
    error instanceof EnvdenError &&
    error.cause &&
    typeof error.cause === "object" &&
    "exitCode" in error.cause &&
    typeof error.cause.exitCode === "number"
  )
    return error.cause.exitCode;

  return undefined;
}
