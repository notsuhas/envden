export function caughtError(caught: unknown) {
  const error = caught instanceof Error ? caught : new Error("Unknown failure");
  const code = "code" in error && typeof error.code === "string" ? error.code : undefined;

  return { code, message: error.message };
}
