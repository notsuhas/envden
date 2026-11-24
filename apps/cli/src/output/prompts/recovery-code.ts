import * as p from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";
import { secret } from "./questions.ts";

function codeProblem(value: string): string | undefined {
  try {
    p.decodeRecoveryCode(value);

    return undefined;
  } catch (error) {
    if (!(error instanceof EnvdenError)) throw error;

    return error.message;
  }
}

// Checked as it's typed, so a typo is caught before anything reaches the server.
export function askRecoveryCode(ask = secret): Promise<string> {
  return ask("Recovery code (ER1-…)", codeProblem);
}
