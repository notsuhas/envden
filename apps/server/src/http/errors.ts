import { ErrorResponseSchema } from "@envden/core/protocol";
import type { ErrorHandler } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { EnvdenError, type TErrorCode } from "@envden/core/errors";

const statuses = {
  BUSY: 503,
  INVALID_INPUT: 400,
  INVALID_DATA: 400,
  UPDATE_REQUIRED: 426,
  ROLLBACK: 409,
  FORK: 409,
  NOT_MEMBER: 403,
  UNAUTHORIZED: 401,
  LOCKED: 403,
  STORAGE_QUOTA: 507,
  RATE_LIMITED: 429,
  CONFLICT: 409,
  NOT_FOUND: 404,
  HEAD_MOVED: 409,
  RESTORED_MODE: 409,
  MOVING: 409,
  SERVER_TOO_OLD: 426,
  CLIENT_TOO_OLD: 426,
  NOT_IMPLEMENTED: 501,
  INTERNAL: 500,
  SERVER_UNREACHABLE: 502,
} satisfies Record<TErrorCode, ContentfulStatusCode>;

export const onError: ErrorHandler = (error, c) => {
  const code =
    error instanceof EnvdenError
      ? error.code
      : error instanceof SyntaxError
        ? "INVALID_INPUT"
        : "INTERNAL";

  if (statuses[code] === 500)
    console.error("envden request failed", { code, method: c.req.method });

  const hint =
    code === "UNAUTHORIZED" && c.req.path.startsWith("/v1/opaque/login/")
      ? { hint: "The vault may have moved; try the current server address" }
      : {};

  return c.json(ErrorResponseSchema.parse({ error: code, ...hint }), statuses[code]);
};
