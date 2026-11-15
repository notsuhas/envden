import { recordUpdateRequired, withUpdateStatus } from "./updates/status.ts";
import { createAdapters } from "./adapters.ts";
import { withTerminalErrors } from "./output/errors.ts";
import { sanitizeTerminal } from "./output/sanitize.ts";
import { isEnvdenError } from "@envden/core/errors";
import { errorExitCode } from "./output/exit-code.ts";
import { createProgram } from "./program.ts";
import { reportProblem } from "./report/run.ts";

async function runCli(now: () => number) {
  try {
    await withUpdateStatus(createAdapters(undefined, now).home, () =>
      createProgram(now).parseAsync(),
    );
  } catch (error) {
    if (isEnvdenError(error) && error.code === "CLIENT_TOO_OLD")
      await recordUpdateRequired(createAdapters(undefined, now).home, error, now);

    console.error(sanitizeTerminal(error instanceof Error ? error.message : "Command failed"));
    process.exitCode = isEnvdenError(error) ? errorExitCode(error.code) : 1;

    await reportProblem(error, createAdapters(undefined, now));
  }
}

if (import.meta.main) await withTerminalErrors(() => runCli(Date.now));
