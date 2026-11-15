import { test, expect } from "bun:test";
import { EnvdenError } from "@envden/core/errors";
import { commandOutcome, telemetryPayload } from "../telemetry/report.ts";

for (const command of ["vault password reset"])
  for (const failure of [undefined, new EnvdenError("LOCKED", "fixed"), new Error("private input")])
    test(`telemetry outcome ${command} ${!!failure}`, async () => {
      const events: unknown[] = [];

      const action = commandOutcome(
        async () => {
          if (failure) throw failure;

          return 42;
        },
        async (event) => {
          events.push(telemetryPayload("id", { command, ...event, changed: 2, conflicts: 0 }));
        },
      );

      if (failure) await Promise.resolve(expect(action).rejects.toBe(failure));
      else expect(await action).toBe(42);

      expect(events).toHaveLength(1);

      expect(events[0]).toMatchObject({
        properties: { command, success: !failure, changed: 2, conflicts: 0 },
      });

      expect(JSON.stringify(events)).not.toContain("private input");
    });

test("telemetry cannot hold the command result", async () => {
  let release = () => {};

  const report = new Promise<void>((resolve) => {
    release = resolve;
  });

  let done = false;

  const action = commandOutcome(
    async () => 42,
    () => report,
  ).then(() => {
    done = true;
  });

  try {
    await Promise.resolve();
    await Promise.resolve();
    expect(done).toBe(true);
  } finally {
    release();
    await action;
  }
});
