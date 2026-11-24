import { isEnvdenError } from "@envden/core/errors";

export function isStaleSwapError(error: unknown) {
  return isEnvdenError(error) && (error.code === "HEAD_MOVED" || error.code === "UNAUTHORIZED");
}
