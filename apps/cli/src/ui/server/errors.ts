import { EnvdenError, type TErrorCode } from "@envden/core/errors";
import type { ContentfulStatusCode } from "hono/utils/http-status";

const badRequest = ["INVALID_INPUT", "INVALID_DATA", "RECOVERY_KIT_REQUIRED"];
const refused = ["UNAUTHORIZED", "NOT_MEMBER", "LOCKED"];
const outdated = ["UPDATE_REQUIRED", "SERVER_TOO_OLD", "CLIENT_TOO_OLD"];
const upstream = ["SERVER_UNREACHABLE", "RATE_LIMITED", "STORAGE_QUOTA", "MOVING", "BUSY"];

export function errorStatus(code: TErrorCode): ContentfulStatusCode {
  if (badRequest.includes(code)) return 400;
  if (refused.includes(code)) return 403;
  if (code === "NOT_FOUND") return 404;
  if (outdated.includes(code)) return 426;
  if (code === "NOT_IMPLEMENTED") return 501;
  if (upstream.includes(code)) return 502;

  return code === "INTERNAL" ? 500 : 409;
}

// EnvdenError messages are fixed text; anything else could carry paths or stack frames.
export function errorBody(error: unknown): { error: TErrorCode; message: string } {
  if (error instanceof EnvdenError) return { error: error.code, message: error.message };

  return { error: "INTERNAL", message: "envden ui hit an internal error" };
}
