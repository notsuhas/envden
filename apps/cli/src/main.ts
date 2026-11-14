import { cleanupReleaseState } from "./updates/cache.ts";
import { recordUpdateRequired } from "./updates/status.ts";
import { createAdapters } from "./adapters.ts";
import { withTerminalErrors } from "./output/errors.ts";
import { sanitizeTerminal } from "./output/sanitize.ts";
import { isEnvdenError } from "@envden/core/errors";
import { errorExitCode } from "./output/exit-code.ts";
import { createProgram } from "./program.ts";

async function runCli() {
  try {
    await cleanupReleaseState(createAdapters().home);
    await createProgram().parseAsync();
  } catch (error) {
    if (isEnvdenError(error) && error.code === "CLIENT_TOO_OLD")
      await recordUpdateRequired(createAdapters().home);

    console.error(sanitizeTerminal(error instanceof Error ? error.message : "Command failed"));
    process.exitCode = isEnvdenError(error) ? errorExitCode(error.code) : 1;
  }
}

if (import.meta.main) await withTerminalErrors(runCli);
