import { EnvdenError } from "@envden/core/errors";

export function protocolInput<T>(parse: () => T): T {
  try {
    return parse();
  } catch (cause) {
    const unknown =
      cause instanceof Error &&
      ["Unknown type", "Unknown version", "Unknown entry kind", "Unknown operation"].includes(
        cause.message,
      );

    throw new EnvdenError(
      unknown ? "SERVER_TOO_OLD" : "INVALID_INPUT",
      unknown ? "Update server" : "Invalid input",
      { cause },
    );
  }
}
