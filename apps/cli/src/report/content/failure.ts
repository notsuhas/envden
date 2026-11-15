import { isEnvdenError } from "@envden/core/errors";

export interface IFailure {
  code: string;
  message: string;
  causes: string[];
  stack?: string;
}

const CAUSE_DEPTH = 5;

function messageOf(value: unknown): string {
  return value instanceof Error ? value.message : String(value);
}

function causeChain(error: unknown): string[] {
  const causes: string[] = [];
  let cause = error instanceof Error ? error.cause : undefined;

  while (cause !== undefined && causes.length < CAUSE_DEPTH) {
    causes.push(messageOf(cause));
    cause = cause instanceof Error ? cause.cause : undefined;
  }

  return causes;
}

export function describeFailure(error: unknown): IFailure {
  const failure = {
    code: isEnvdenError(error) ? error.code : error instanceof Error ? error.name : typeof error,
    message: messageOf(error),
    causes: causeChain(error),
  };

  return !isEnvdenError(error) && error instanceof Error && error.stack
    ? { ...failure, stack: error.stack }
    : failure;
}
