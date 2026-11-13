import type { TErrorCode } from "./error-code.ts";

export class EnvdenError extends Error {
  readonly code: TErrorCode;

  constructor(code: TErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "EnvdenError";
    this.code = code;
  }
}

export function isEnvdenError(value: unknown): value is EnvdenError {
  return value instanceof EnvdenError;
}
