import { expect, test } from "bun:test";
import type { TFetch } from "../../client/fetch.ts";
import { terminalJson } from "../../output/sanitize.ts";
import { loadState, saveState } from "../../state/store/repository.ts";
import { atomicWrite } from "../../state/store/files.ts";
import { readBytes } from "../../sync/local/files.ts";
import { pull, push } from "../../sync/engine.ts";
import { createSharedFixture } from "../../sync/__tests__/shared-fixture.ts";
import { fileHistory } from "../list/run.ts";
import { historyText } from "../list/render.ts";
import { restoreVersion } from "../restore/run.ts";
import { restoreText } from "../restore/render.ts";

const syncFixture = createSharedFixture();
const secrets = ["local-test-value", "secret-db-v2", "rotated-secret-v3"];
const v1 = "TOKEN=local-test-value\n";
const v2 = "TOKEN=local-test-value\nDB_URL=postgres://secret-db-v2\n";
const v3 = "TOKEN=rotated-secret-v3\nDB_URL=postgres://secret-db-v2\n";

async function threeVersions() {
  const f = await syncFixture();
  const at = (offset: number) => ({ ...f.opts, now: () => f.now() + offset });

  await atomicWrite(f.aStore, v2, f.now);
  await push(f.first, at(60000));
  await pull(f.second, f.opts);
  await atomicWrite((await loadState(f.second.home))!.links[0]!.store, v3, f.now);
  await push(f.second, at(120000));
  await pull(f.first, f.opts);

  const list = (fetcher: TFetch = f.fetcher, adapters = f.first, cwd = f.checkout.root) =>
    fileHistory(adapters, { cwd, now: f.now, fetcher });

  const restore = (version: number, changes: Partial<Parameters<typeof restoreVersion>[1]> = {}) =>
    restoreVersion(f.first, {
      cwd: f.checkout.root,
      file: ".env",
      version,
      yes: true,
      interactive: true,
      confirm: async () => true,
      now: f.now,
      fetcher: f.fetcher,
      ...changes,
    });

  return { f, list, restore };
}

function expectNoValues(output: string) {
  for (const secret of secrets) expect(output).not.toContain(secret);
}

test("history lists versions newest first with devices and key names only", async () => {
  const { f, list } = await threeVersions();

  try {
    const result = await list();

    expect(result.files).toHaveLength(1);
    const [file] = result.files;
    expect(file!.pruned).toBe(false);
    expect(file!.checkouts).toEqual([{ root: f.checkout.root, version: 3 }]);

    expect(file!.versions).toEqual([
      {
        version: 3,
        kind: "live",
        time: new Date(f.now() + 120000).toISOString(),
        device: "second",
        changes: { added: [], changed: ["TOKEN"], removed: [] },
      },
      {
        version: 2,
        kind: "live",
        time: new Date(f.now() + 60000).toISOString(),
        device: "first",
        changes: { added: ["DB_URL"], changed: [], removed: [] },
      },
      {
        version: 1,
        kind: "live",
        time: new Date(f.now()).toISOString(),
        device: "first",
        changes: { added: ["TOKEN"], changed: [], removed: [] },
      },
    ]);

    const text = historyText(result);
    expect(text).toContain("v3");
    expect(text).toContain("<- current");
    expectNoValues(text);
    expectNoValues(terminalJson(result));
  } finally {
    await f.cleanup();
  }
});

test("restore writes an old version locally and the next push publishes it", async () => {
  const { f, list, restore } = await threeVersions();

  try {
    const prompts: string[] = [];

    const cancelled = await restore(1, {
      yes: false,
      confirm: async (message) => (prompts.push(message), false),
    });

    expect(cancelled.kind).toBe("cancelled");
    expect(prompts[0]).toContain("TOKEN");
    expectNoValues(prompts.join("\n"));

    await Promise.resolve(
      expect(restore(1, { interactive: false })).rejects.toMatchObject({ code: "INVALID_INPUT" }),
    );

    const restored = await restore(1);

    expect(restored).toMatchObject({
      kind: "restored",
      version: 1,
      changes: { added: [], changed: ["TOKEN"], removed: ["DB_URL"] },
    });

    expectNoValues(restoreText(restored) + terminalJson(restored));
    expect(new TextDecoder().decode(await readBytes(f.aStore))).toBe(v1);

    const local = (await list()).files[0]!;
    expect(local.versions.map((version) => version.version)).toEqual([3, 2, 1]);
    expect(local.checkouts[0]!.version).toBe(1);

    await push(f.first, { ...f.opts, now: () => f.now() + 180000 });
    const published = (await list()).files[0]!;
    expect(published.versions[0]).toMatchObject({ version: 4, device: "first" });
    expect(published.checkouts[0]!.version).toBe(4);
  } finally {
    await f.cleanup();
  }
});

test("restore refuses local-only files", async () => {
  const { f, restore } = await threeVersions();

  try {
    const state = (await loadState(f.first.home))!;
    state.links[0]!.localOnly = true;
    await saveState(f.first.home, state, f.now);

    await Promise.resolve(expect(restore(1)).rejects.toMatchObject({ code: "INVALID_INPUT" }));
    expect(new TextDecoder().decode(await readBytes(f.aStore))).toBe(v3);
  } finally {
    await f.cleanup();
  }
});

test("pruned lists and blobs end the history", async () => {
  const { f, list } = await threeVersions();

  try {
    const blobs: string[] = [];
    const lists: string[] = [];

    const recording: TFetch = (input, init) => {
      const path = new URL(input instanceof Request ? input.url : input.toString()).pathname;
      if (path.startsWith("/v1/blobs/")) blobs.push(path);
      if (path.startsWith("/v1/files/")) lists.push(path);

      return f.fetcher(input, init);
    };

    await list(recording, f.second, f.checkoutB.root);

    const missing =
      (paths: string[]): TFetch =>
      (input, init) =>
        paths.includes(new URL(input instanceof Request ? input.url : input.toString()).pathname)
          ? Promise.resolve(Response.json({ error: "NOT_FOUND" }, { status: 404 }))
          : f.fetcher(input, init);

    const withoutBlob = (await list(missing([blobs.at(-1)!]), f.second, f.checkoutB.root))
      .files[0]!;

    expect(withoutBlob.pruned).toBe(true);
    expect(withoutBlob.versions.map((version) => version.version)).toEqual([3, 2]);
    expect(withoutBlob.versions[1]).toMatchObject({ device: "first", changes: "unknown" });

    const headOnly = await list(missing(lists.slice(1)), f.second, f.checkoutB.root);
    expect(headOnly.files[0]!.versions).toEqual([{ version: 3, kind: "live", changes: "unknown" }]);
    expect(historyText(headOnly)).toContain("older versions pruned");
  } finally {
    await f.cleanup();
  }
});
