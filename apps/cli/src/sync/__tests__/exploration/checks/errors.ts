import type { TModel } from "../model.ts";

export function caughtError(caught: unknown) {
  const error = caught instanceof Error ? caught : new Error("Unknown failure");
  const code = "code" in error && typeof error.code === "string" ? error.code : undefined;

  return { code, message: error.message };
}

export function checkCorruptState(model: TModel, d: number, reports: string[]) {
  if (model.corrupt.delete(d) && !reports.some((report) => report.startsWith("Invalid sync state")))
    model.bad("corrupt-state-ignored", "Corrupt receipt was silently ignored");
}
