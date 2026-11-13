import { expect, test } from "bun:test";
import { EnvdenError } from "@envden/core/errors";
import { protocolInput } from "../http/protocol.ts";

test("protocol errors use codes rather than message strings", () => {
  for (const [cause, code] of [
    [new EnvdenError("UPDATE_REQUIRED", "Future format"), "SERVER_TOO_OLD"],
    [new EnvdenError("INVALID_DATA", "Truncated data"), "INVALID_INPUT"],
    [new EnvdenError("SERVER_TOO_OLD", "Unsupported protocol"), "SERVER_TOO_OLD"],
    [new Error("Unknown version"), "INVALID_INPUT"],
  ] as const) {
    expect(() =>
      protocolInput(() => {
        throw cause;
      }),
    ).toThrow(expect.objectContaining({ code }));
  }
});
