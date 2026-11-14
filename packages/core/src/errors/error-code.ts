import { z } from "zod";

export const ErrorCodeSchema = z.enum([
  "INVALID_INPUT",
  "INVALID_DATA",
  "UPDATE_REQUIRED",
  "ROLLBACK",
  "FORK",
  "NOT_MEMBER",
  "UNAUTHORIZED",
  "LOCKED",
  "STORAGE_QUOTA",
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
  "SERVER_UNREACHABLE",
  "BUSY",
]);

export type TErrorCode = z.infer<typeof ErrorCodeSchema>;
