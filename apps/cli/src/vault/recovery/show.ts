import { EnvdenError } from "@envden/core/errors";
import { consent } from "../../output/prompts/questions.ts";
import {
  recoveryCodeSavedText,
  recoveryCodeText,
  UNSTORED_CODE_TEXT,
} from "../../output/render/devices/recovery-code.ts";
import { writeRecoveryCode } from "./output.ts";

interface ICodeOutput {
  path?: string | undefined;
  terminal?: boolean;
  ask?: typeof consent;
}

// Checked before any key is made, so a code is never printed where only an agent would see it.
export function requireCodeOutput(output: ICodeOutput) {
  const terminal = output.terminal ?? (!!process.stdin.isTTY && !!process.stdout.isTTY);

  if (!output.path && !terminal)
    throw new EnvdenError(
      "INVALID_INPUT",
      "Showing the recovery code needs a terminal. Run this in your own terminal, or pass --recovery-code-out <file>",
    );
}

// The code is shown once and never stored, so a failure after showing it says which code to keep.
export function recoveryCodeOutput(output: ICodeOutput = {}) {
  let shown = false;

  return {
    show: async (code: string) => {
      if (output.path) {
        await writeRecoveryCode(output.path, code);
        console.log(recoveryCodeSavedText(output.path));
      } else {
        console.log(recoveryCodeText(code));
        if (!(await (output.ask ?? consent)("Stored it?"))) console.log(UNSTORED_CODE_TEXT);
      }

      shown = true;
    },
    fail: (error: unknown): never => {
      if (shown)
        console.error(
          "envden: The new recovery code isn't confirmed yet. Keep the old one too, and run this command again to finish.",
        );

      throw error;
    },
  };
}
