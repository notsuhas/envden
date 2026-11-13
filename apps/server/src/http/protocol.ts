import { EnvdenError } from "@envden/core/errors";

export function protocolInput<T>(parse: () => T): T {
  try {
    return parse();
  } catch (cause) {
    const unknown =
      cause instanceof EnvdenError &&
      (cause.code === "SERVER_TOO_OLD" || cause.code === "UPDATE_REQUIRED");

    throw new EnvdenError(
      unknown ? "SERVER_TOO_OLD" : "INVALID_INPUT",
      unknown ? "Update server" : "Invalid input",
      { cause },
    );
  }
}
