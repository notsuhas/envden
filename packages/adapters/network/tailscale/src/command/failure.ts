import { EnvdenError } from "@envden/core/errors";

const STDERR_LIMIT = 500;

// Tailscale's own output holds the next step, such as the link to enable Serve.
export function failure(summary: string, stderr: string, cause?: unknown) {
  const detail = stderr.trim().slice(0, STDERR_LIMIT);

  return new EnvdenError("INTERNAL", detail ? `${summary}: ${detail}` : summary, { cause });
}
