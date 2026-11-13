import { type TErrorCode, EnvdenError } from "@envden/core/errors";

const codes: ReadonlySet<string> = new Set<TErrorCode>([
  "INVALID_INPUT",
  "INVALID_DATA",
  "UPDATE_REQUIRED",
  "ROLLBACK",
  "FORK",
  "NOT_MEMBER",
  "UNAUTHORIZED",
  "LOCKED",
  "RATE_LIMITED",
  "CONFLICT",
  "NOT_FOUND",
  "HEAD_MOVED",
  "RESTORED_MODE",
  "MOVING",
  "SERVER_TOO_OLD",
  "CLIENT_TOO_OLD",
  "UNSAFE_VERSION",
  "NOT_IMPLEMENTED",
  "INTERNAL",
]);

function isCode(value: unknown): value is TErrorCode {
  return typeof value === "string" && codes.has(value);
}

export async function responseError(response: Response): Promise<EnvdenError> {
  let data: unknown;

  try {
    data = await response.json();
  } catch {
    data = undefined;
  }

  if (data && typeof data === "object" && "kind" in data && data.kind === "head-moved")
    return new EnvdenError("HEAD_MOVED", "The manifest head moved");

  if (data && typeof data === "object" && "error" in data && isCode(data.error))
    return new EnvdenError(data.error, "Server refused the request");

  return new EnvdenError("INVALID_DATA", "Invalid server response");
}
