import type { TErrorCode } from "@envden/core/errors";
import { isEnvdenError } from "@envden/core/errors";
import { PromptCancelled } from "../state/cancelled.ts";

interface IReportOfferInput {
  error: unknown;
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

const ENVDEN_BUG: Record<TErrorCode, boolean> = {
  INVALID_DATA: true,
  INTERNAL: true,
  NOT_IMPLEMENTED: true,
  HEAD_MOVED: true,
  BUSY: true,
  ROLLBACK: true,
  FORK: true,
  INVALID_INPUT: false,
  CONFLICT: false,
  LOCKED: false,
  UNAUTHORIZED: false,
  NOT_MEMBER: false,
  RATE_LIMITED: false,
  RECOVERY_KIT_REQUIRED: false,
  UPDATE_REQUIRED: false,
  CLIENT_TOO_OLD: false,
  SERVER_TOO_OLD: false,
  NOT_FOUND: false,
  STORAGE_QUOTA: false,
  SERVER_UNREACHABLE: false,
  MOVING: false,
  RESTORED_MODE: false,
};

export function deriveReportOffer(input: IReportOfferInput): boolean {
  const { error, interactive, env } = input;

  if (!interactive || env.ENVDEN_NO_REPORT === "1") return false;

  if (AGENT_VARIABLES.some((name) => env[name])) return false;

  if (error instanceof PromptCancelled) return false;

  return isEnvdenError(error) ? ENVDEN_BUG[error.code] : true;
}
