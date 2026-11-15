import { EventEmitter } from "node:events";
import { expect, test } from "bun:test";
import { readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { startWorkers, runWorker, stopWorkers } from "../workers.ts";

function factory(replacementReady = true) {
  let created = 0;

  return () => {
    const events = new EventEmitter();
    const kind = ++created <= 4 || replacementReady ? "ready" : "error";
    queueMicrotask(() => events.emit("message", { kind }));

    return {
      on: events.on.bind(events),
      postMessage: (message: { kind: string }) => {
        const reply =
          message.kind === "close"
            ? { kind: "closed" }
            : { kind: "result", result: { violations: [] } };

        queueMicrotask(() => events.emit("message", reply));
      },
      terminate: async () => 0,
    };
  };
}

test("aborted batch replaces its slot and shutdown removes every worker directory", async () => {
  const before = (await readdir(tmpdir())).filter((name) => name.startsWith("envden-sync-worker-"));
  await startWorkers(factory());

  try {
    await Promise.resolve(
      expect(runWorker(0, ["copy"], ["Be", "Bs"], AbortSignal.abort())).rejects.toThrow(),
    );

    expect((await runWorker(0, ["copy"], ["Bl"])).violations).toEqual([]);
  } finally {
    await stopWorkers();
  }

  expect(
    (await readdir(tmpdir())).filter((name) => name.startsWith("envden-sync-worker-")),
  ).toEqual(before);
});

test("workers leave deadlines to the test runner", async () => {
  expect(await Bun.file(new URL("../workers.ts", import.meta.url)).text()).not.toContain(
    "AbortSignal.timeout",
  );
});

test("replacement must acknowledge readiness", async () => {
  await startWorkers(factory(false));

  try {
    await Promise.resolve(
      expect(runWorker(0, ["copy"], [], AbortSignal.abort())).rejects.toThrow(
        "replacement worker failed to start",
      ),
    );
  } finally {
    await stopWorkers();
  }
});
