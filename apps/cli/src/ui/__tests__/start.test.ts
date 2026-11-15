import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createMemoryKeychainAdapter } from "@envden/testing/keychain";
import { createAdapters } from "../../adapters.ts";
import { runDashboard } from "../start.ts";

test("refuses to start without an interactive terminal", async () => {
  const home = await mkdtemp(join(tmpdir(), "envden-ui-"));
  const lines: string[] = [];

  try {
    const adapters = createAdapters(
      { home, userHome: home, keychain: createMemoryKeychainAdapter([]) },
      () => 0,
    );

    const started = runDashboard(adapters, {
      interactive: false,
      now: () => 0,
      report: (line) => lines.push(line),
      stopped: Promise.resolve(),
    });

    expect(await started.catch((error: unknown) => error)).toMatchObject({ code: "INVALID_INPUT" });
    expect(lines).toEqual([]);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
