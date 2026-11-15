import { recordUpdateRequired, withUpdateStatus } from "./updates/status.ts";
import { createAdapters } from "./adapters.ts";
import { withTerminalErrors } from "./output/errors.ts";
import { sanitizeTerminal } from "./output/sanitize.ts";
import { isEnvdenError } from "@envden/core/errors";
import { errorExitCode } from "./output/exit-code.ts";
import { createProgram } from "./program.ts";
import { reportProblem } from "./report/run.ts";
import {
  TELEMETRY_BODY,
  TELEMETRY_SEND_COMMAND,
  deliverTelemetry,
} from "./output/telemetry/background.ts";

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

// the telemetry child skips state, notices and update checks: it only sends its one event
if (import.meta.main && process.argv[2] === TELEMETRY_SEND_COMMAND)
  await deliverTelemetry(process.env[TELEMETRY_BODY]);
else if (import.meta.main) await withTerminalErrors(() => runCli(Date.now));
