import { EnvdenError } from "@envden/core/errors";

export class PromptCancelled extends EnvdenError {
  constructor() {
    super("INVALID_INPUT", "Cancelled");
  }
}
