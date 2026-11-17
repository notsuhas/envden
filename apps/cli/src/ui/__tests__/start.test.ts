import { expect, spyOn, test } from "bun:test";
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

test("the dashboard closes idle connections after 10 seconds", async () => {
  const home = await mkdtemp(join(tmpdir(), "envden-ui-"));
  const serve = spyOn(Bun, "serve");

  try {
    const adapters = createAdapters(
      { home, userHome: home, keychain: createMemoryKeychainAdapter([]) },
      () => 0,
    );

    await runDashboard(adapters, {
      interactive: true,
      now: () => 0,
      report: () => {},
      stopped: Promise.resolve(),
    });

    expect(serve.mock.calls[0]?.[0]).toMatchObject({ hostname: "127.0.0.1", idleTimeout: 10 });
  } finally {
    serve.mockRestore();
    await rm(home, { recursive: true, force: true });
  }
});

test("a stop signal at the URL line closes the dashboard", async () => {
  const home = await mkdtemp(join(tmpdir(), "envden-ui-"));
  const signals = new EventTarget();

  const stopped = new Promise<void>((resolve) => {
    signals.addEventListener("SIGTERM", () => resolve(), { once: true });
  });

  let url = "";

  try {
    const adapters = createAdapters(
      { home, userHome: home, keychain: createMemoryKeychainAdapter([]) },
      () => 0,
    );

    expect(
      await runDashboard(adapters, {
        interactive: true,
        now: () => 0,
        report: (line) => {
          if (line.startsWith("envden ui: ")) {
            url = line.slice("envden ui: ".length);
            signals.dispatchEvent(new Event("SIGTERM"));
          }
        },
        stopped,
      }),
    ).toEqual({ kind: "stopped" });

    expect(
      await fetch(url).then(
        () => false,
        () => true,
      ),
    ).toBe(true);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
