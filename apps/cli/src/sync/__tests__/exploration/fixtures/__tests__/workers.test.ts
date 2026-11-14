import { expect, test } from "bun:test";
import { readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { startWorkers, runWorker, stopWorkers } from "../workers.ts";

test("aborted batch replaces its slot and shutdown removes every worker directory", async () => {
  const before = (await readdir(tmpdir())).filter((name) => name.startsWith("envden-sync-worker-"));
  await startWorkers();

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
