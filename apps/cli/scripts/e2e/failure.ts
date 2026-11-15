import { millisecondsInMinute } from "date-fns/constants";

export const E2E_TIMEOUT = millisecondsInMinute;

export function failure(step: string, output: string): Error {
  return new Error(`E2E failed: ${step}\n--- captured output ---\n${output.trim()}\n---`);
}
