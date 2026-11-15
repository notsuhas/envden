import type { TErrorCode } from "@envden/core/errors";
import { isEnvdenError } from "@envden/core/errors";
import { PromptCancelled } from "../state/cancelled.ts";

interface IReportOfferInput {
  error: unknown;
  command?: string | undefined;
  interactive: boolean;
  env: Record<string, string | undefined>;
}

// Variables coding agents set for the commands they run; agents handle their own errors.
const AGENT_VARIABLES = [
  "AI_AGENT",
  "CLAUDECODE",
  "CLAUDE_CODE_ENTRYPOINT",
  "CODEX_SANDBOX",
  "CODEX_SANDBOX_NETWORK_DISABLED",
  "CODEX_THREAD_ID",
  "CODEX_CI",
  "GEMINI_CLI",
  "CURSOR_AGENT",
  "OPENCODE",
];

// "No" is the default, so offering too often costs one keypress; missing a real bug costs the report
const USERS_TO_FIX: Record<TErrorCode, boolean> = {
  INVALID_INPUT: true,
  UNAUTHORIZED: true,
  LOCKED: true,
  RATE_LIMITED: true,
  UPDATE_REQUIRED: true,
  CLIENT_TOO_OLD: true,
  NOT_FOUND: true,
  STORAGE_QUOTA: true,
  SERVER_UNREACHABLE: true,
  CONFLICT: false,
  INVALID_DATA: false,
  INTERNAL: false,
  NOT_IMPLEMENTED: false,
  HEAD_MOVED: false,
  BUSY: false,
  ROLLBACK: false,
  FORK: false,
  NOT_MEMBER: false,
  RECOVERY_KIT_REQUIRED: false,
  SERVER_TOO_OLD: false,
  MOVING: false,
  RESTORED_MODE: false,
};

// push, pull and resolve exit with CONFLICT for ordinary sync conflicts
const SYNC_COMMANDS = new Set(["push", "pull", "resolve"]);

export function deriveReportOffer(input: IReportOfferInput): boolean {
  const { error, command, interactive, env } = input;

  if (!interactive || env.ENVDEN_NO_REPORT === "1") return false;

  if (AGENT_VARIABLES.some((name) => env[name])) return false;

  if (error instanceof PromptCancelled) return false;

  if (!isEnvdenError(error)) return true;

  if (error.code === "CONFLICT" && command && SYNC_COMMANDS.has(command)) return false;

  return !USERS_TO_FIX[error.code];
}
