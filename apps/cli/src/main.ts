import { isEnvdenError } from "@envden/core/errors";
import { errorExitCode } from "./output/exit-code.ts";
import { createProgram } from "./program.ts";

async function runCli() {
  try {
    await createProgram().parseAsync();
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Command failed");
    process.exitCode = isEnvdenError(error) ? errorExitCode(error.code) : 1;
  }
}

if (import.meta.main) await runCli();
