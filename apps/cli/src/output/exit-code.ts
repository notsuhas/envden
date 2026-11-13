import type { TErrorCode } from "@envden/core/errors";

export function errorExitCode(code: TErrorCode): number {
  if (code === "CONFLICT") return 3;

  if (code === "INVALID_INPUT" || code === "NOT_IMPLEMENTED") return 2;

  return 1;
}
