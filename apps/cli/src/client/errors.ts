import { ErrorResponseSchema } from "@envden/core/protocol";
import { EnvdenError, type TErrorCode } from "@envden/core/errors";

const messages: Record<TErrorCode, string> = {
  INVALID_INPUT: "Server rejected the request. Update envden and try again",
  INVALID_DATA: "Server rejected the data. Update envden and try again",
  UPDATE_REQUIRED: "Server uses a newer format. Update envden",
  ROLLBACK: "Server is behind this device. Run envden server repair",
  FORK: "Server history conflicts with this device. Run envden server repair",
  NOT_MEMBER: "This device was removed from the vault. Run envden join to rejoin",
  UNAUTHORIZED: "Server rejected this device's signature. Check the system clock and try again",
  LOCKED: "This device's vault keys are unavailable. Run envden doctor",
  RECOVERY_CODE_REQUIRED: "Replace the recovery code first. Run envden vault recovery-code",
  STORAGE_QUOTA:
    "Vault storage on the server is full. Remove files with envden rm, or ask the server owner for more space",
  RATE_LIMITED: "Too many attempts. Wait 15 minutes and try again",
  CONFLICT: "Server state changed during the request. Run the command again",
  NOT_FOUND: "Server doesn't know this vault. Check the server address with envden status",
  HEAD_MOVED: "Another device changed the vault. Run the command again",
  RESTORED_MODE: "Server was restored from a backup. Run envden server repair",
  MOVING: "Vault is moving to another server. Try again when the move finishes",
  SERVER_TOO_OLD: "Server is too old for this envden. Update the server",
  CLIENT_TOO_OLD: "This envden is too old for the server. Update envden",
  NOT_IMPLEMENTED: "Server doesn't support this yet. Update the server",
  INTERNAL: "Server hit an internal error. Check the server logs",
  SERVER_UNREACHABLE: "Server can't reach its storage. Try again later",
  BUSY: "Server is busy. Try again in a minute",
};

const joinGone: TErrorCode[] = ["NOT_FOUND", "CONFLICT", "UNAUTHORIZED"];

function serverErrorMessage(code: TErrorCode, path: string): string {
  if (
    path.startsWith("/v1/join-requests/") &&
    path !== "/v1/join-requests/approved" &&
    joinGone.includes(code)
  )
    return "Join request expired, was cancelled, or another device took it. Run envden join again";

  if (path === "/v1/recovery/ticket" && code === "UNAUTHORIZED")
    return "The server has no vault for that recovery code. If the vault moved, use its current server address";

  if (path === "/v1/recovery/ticket" && code === "RECOVERY_CODE_REQUIRED")
    return "After a restore the server can't vouch for this recovery code; replace it from a device in the vault";

  return messages[code];
}

export async function responseError(response: Response, path = ""): Promise<EnvdenError> {
  let data: unknown;

  try {
    data = await response.json();
  } catch {
    data = undefined;
  }

  if (data && typeof data === "object" && "kind" in data && data.kind === "head-moved")
    return new EnvdenError("HEAD_MOVED", messages.HEAD_MOVED);

  const parsed = ErrorResponseSchema.safeParse(data);

  if (parsed.success)
    return new EnvdenError(parsed.data.error, serverErrorMessage(parsed.data.error, path));

  return new EnvdenError("INVALID_DATA", "Invalid server response");
}
