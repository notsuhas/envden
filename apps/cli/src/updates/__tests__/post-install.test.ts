import { test, expect } from "bun:test";
import { postInstall } from "../self/execute.ts";

test("post-install retains envden paths and privacy choices only", async () => {
  const before = { ...process.env };

  try {
    Object.assign(process.env, {
      ENVDEN_HOME: "/custom",
      ENVDEN_KEYCHAIN: "file",
      ENVDEN_NO_UPDATE_CHECK: "1",
      ENVDEN_TELEMETRY: "0",
      DO_NOT_TRACK: "1",
      NODE_OPTIONS: "unsafe",
    });

    await postInstall("/envden", async (_command, env) => {
      for (const key of [
        "ENVDEN_HOME",
        "ENVDEN_KEYCHAIN",
        "ENVDEN_NO_UPDATE_CHECK",
        "ENVDEN_TELEMETRY",
        "DO_NOT_TRACK",
      ])
        expect(env?.[key]).toBe(process.env[key]);

      expect(env?.NODE_OPTIONS).toBeUndefined();
    });
  } finally {
    process.env = before;
  }
});
