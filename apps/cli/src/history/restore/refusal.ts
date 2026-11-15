import type { TErrorCode } from "@envden/core/errors";

interface IRestoreRefusal {
  code: TErrorCode;
  message: string;
}

export function restoreRefusal(input: {
  managed: boolean;
  localOnly: boolean;
  detached: boolean;
  conflicted: boolean;
}): IRestoreRefusal | undefined {
  if (!input.managed) return { code: "NOT_FOUND", message: "File is not managed by envden" };

  if (input.localOnly)
    return { code: "INVALID_INPUT", message: "Local-only files are not restored from history" };

  if (input.detached)
    return {
      code: "CONFLICT",
      message: "File is detached; reconcile it with envden pull before restoring",
    };

  if (input.conflicted)
    return { code: "CONFLICT", message: "File has a conflict; run envden resolve first" };

  return undefined;
}
