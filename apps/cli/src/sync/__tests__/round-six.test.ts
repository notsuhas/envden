import { expect, test } from "bun:test";
import { join } from "node:path";
import { rm } from "node:fs/promises";
import { createSharedFixture } from "./shared-fixture.ts";
import { pull, push } from "../engine.ts";
import { loadState } from "../../state/store/repository.ts";
import { atomicWrite } from "../../state/store/files.ts";
import { setConfig } from "../../settings/config.ts";
import { untrack } from "../../links/checkout/untrack.ts";
import { conflictRecords } from "../local/conflicts.ts";
import type { TFetch } from "../../client/fetch.ts";

const fixtureClock = () => 1800000000000;

const fixture = createSharedFixture();

for (const mode of ["link", "copy"] as const)
  test(`missing ${mode} store restores published bytes without uploading deletion`, async () => {
    const f = await fixture();

    await setConfig(
      "placement",
      JSON.stringify({ [f.checkoutB.root]: mode }),
      f.second.home,
      () => 0,
    );

    await pull(f.second, f.opts);
    const store = (await loadState(f.second.home))!.links[0]!.store;
    await rm(store);
    expect((await pull(f.second, f.opts)).conflicts).toBe(0);
    expect(await Bun.file(store).text()).toBe("TOKEN=local-test-value\n");
    expect(await Bun.file(join(f.checkoutB.root, ".env")).text()).toBe("TOKEN=local-test-value\n");
    expect((await push(f.second, f.opts)).changed).toBe(0);
  });

test("skipped remote content cannot be overwritten by push", async () => {
  const f = await fixture();
  await pull(f.second, f.opts);

  await setConfig(
    "env-files",
    JSON.stringify({ include: [".env.*"], exclude: [], extraSkipped: [] }),
    f.second.home,
    () => 0,
  );

  await atomicWrite(f.aStore, "TOKEN=remote\n", fixtureClock);
  await push(f.first, f.opts);
  expect((await push(f.second, f.opts)).changed).toBe(0);
  await pull(f.first, f.opts);
  expect(await Bun.file(f.aStore).text()).toBe("TOKEN=remote\n");

  await setConfig(
    "env-files",
    JSON.stringify({ include: [".env", ".env.*"], exclude: [], extraSkipped: [] }),
    f.second.home,
    () => 0,
  );
});

for (const mode of ["link", "copy"] as const)
  test(`lost push response acknowledges its own ${mode} entry before further edits`, async () => {
    const f = await fixture();

    await setConfig(
      "placement",
      JSON.stringify({ [f.checkoutB.root]: mode }),
      f.second.home,
      () => 0,
    );

    await pull(f.second, f.opts);
    const store = (await loadState(f.second.home))!.links[0]!.store;
    const edited = mode === "copy" ? join(f.checkoutB.root, ".env") : store;
    await atomicWrite(edited, "TOKEN=e1\n", fixtureClock);

    const lost: TFetch = async (input, init) => {
      const response = await f.fetcher(input, init);

      if (new URL(input instanceof Request ? input.url : input.toString()).pathname === "/v1/swap")
        throw new Error("Lost response");

      return response;
    };

    await Promise.resolve(expect(push(f.second, { ...f.opts, fetcher: lost })).rejects.toThrow());
    await atomicWrite(edited, "TOKEN=e2\n", fixtureClock);
    expect((await push(f.second, f.opts)).conflicts).toBe(0);
    await pull(f.first, f.opts);
    expect(await Bun.file(f.aStore).text()).toBe("TOKEN=e2\n");
  });

test("untracking the last conflicting checkout releases the conflict", async () => {
  const f = await fixture();
  await pull(f.second, f.opts);
  const store = (await loadState(f.second.home))!.links[0]!.store;
  await atomicWrite(store, "TOKEN=mine\n", fixtureClock);
  await atomicWrite(f.aStore, "TOKEN=theirs\n", fixtureClock);
  await push(f.first, f.opts);
  expect((await pull(f.second, f.opts)).conflicts).toBe(1);
  await untrack(f.second, f.checkoutB.root);
  expect(await conflictRecords(f.second.home)).toEqual([]);
});

test("detached link with old content is adopted as an edit", async () => {
  const f = await fixture();
  await pull(f.second, f.opts);
  const store = (await loadState(f.second.home))!.links[0]!.store;
  await atomicWrite(store, "TOKEN=new\n", fixtureClock);
  await push(f.second, f.opts);
  const target = join(f.checkoutB.root, ".env");
  await rm(target);
  await atomicWrite(target, "TOKEN=local-test-value\n", fixtureClock);
  expect((await pull(f.second, f.opts)).conflicts).toBe(0);
  expect(await Bun.file(target).text()).toBe("TOKEN=local-test-value\n");
});

test("untracking divergent copy lets remaining link advance", async () => {
  const { approveLayout } = await import("./round-fixture.ts");
  const f = await fixture();
  const targets = await approveLayout(f, ["copy", "link"]);
  await atomicWrite(join(targets[0]!.root, ".env"), "TOKEN=mine\n", fixtureClock);
  await atomicWrite(f.aStore, "TOKEN=theirs\n", fixtureClock);
  await push(f.first, f.opts);
  expect((await pull(f.second, f.opts)).conflicts).toBe(1);
  await untrack(f.second, targets[0]!.root);
  expect((await pull(f.second, f.opts)).conflicts).toBe(0);
  expect(await Bun.file(targets[1]!.store).text()).toBe("TOKEN=theirs\n");
  expect(await Bun.file(join(targets[0]!.root, ".env")).text()).toBe("TOKEN=mine\n");
});

test("missing store is restored even when the remaining copy conflicts", async () => {
  const f = await fixture();

  await setConfig(
    "placement",
    JSON.stringify({ [f.checkoutB.root]: "copy" }),
    f.second.home,
    () => 0,
  );

  await pull(f.second, f.opts);
  const store = (await loadState(f.second.home))!.links[0]!.store;
  await atomicWrite(join(f.checkoutB.root, ".env"), "TOKEN=mine\n", fixtureClock);
  await rm(store);
  await atomicWrite(f.aStore, "TOKEN=remote\n", fixtureClock);
  await push(f.first, f.opts);
  expect((await pull(f.second, f.opts)).conflicts).toBe(1);
  expect(await Bun.file(store).text()).toBe("TOKEN=remote\n");
  expect(await Bun.file(join(f.checkoutB.root, ".env")).text()).toBe("TOKEN=mine\n");
});

test("reverting after a conflict preserves the new user action", async () => {
  const f = await fixture();
  await pull(f.second, f.opts);
  const store = (await loadState(f.second.home))!.links[0]!.store;
  await atomicWrite(store, "TOKEN=mine\n", fixtureClock);
  await atomicWrite(f.aStore, "TOKEN=remote\n", fixtureClock);
  await push(f.first, f.opts);
  expect((await pull(f.second, f.opts)).conflicts).toBe(1);
  await atomicWrite(store, "TOKEN=local-test-value\n", fixtureClock);
  expect((await pull(f.second, f.opts)).conflicts).toBe(1);
  expect(await Bun.file(store).text()).toBe("TOKEN=local-test-value\n");
});

for (const reason of ["refused", "failed", "conflicted"] as const)
  test(`push cannot upload a file whose remote change was ${reason}`, async () => {
    const { EnvdenError } = await import("@envden/core/errors");
    const f = await fixture();
    await pull(f.second, f.opts);
    const store = (await loadState(f.second.home))!.links[0]!.store;
    await atomicWrite(f.aStore, "TOKEN=remote\n", fixtureClock);
    await push(f.first, f.opts);

    if (reason === "conflicted") await atomicWrite(store, "TOKEN=mine\n", fixtureClock);
    else
      f.second.repo.ensureIgnored = async () => {
        if (reason === "refused") throw new EnvdenError("INVALID_INPUT", "Refused placement");
        throw new Error("injected placement failure");
      };

    const result = await push(f.second, f.opts);
    expect(result.conflicts).toBe(1);
    await pull(f.first, f.opts);
    expect(await Bun.file(f.aStore).text()).toBe("TOKEN=remote\n");
  });

test("a missing edited conflict file cannot request deletion", async () => {
  const { resolveConflict } = await import("../resolve.ts");
  const f = await fixture();
  await pull(f.second, f.opts);
  const store = (await loadState(f.second.home))!.links[0]!.store;
  await atomicWrite(store, "TOKEN=mine\n", fixtureClock);
  await atomicWrite(f.aStore, "TOKEN=remote\n", fixtureClock);
  await push(f.first, f.opts);
  await pull(f.second, f.opts);
  const record = (await conflictRecords(f.second.home))[0]!;
  await rm(record.file);

  await Promise.resolve(
    expect(
      resolveConflict(f.second, { file: ".env", choice: "edit", now: f.now }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" }),
  );

  expect(await Bun.file(store).text()).toBe("TOKEN=mine\n");
});

test("missing unpublished store never removes its intact based copy", async () => {
  const { linkFile } = await import("../../links/file.ts");
  const { saveState } = await import("../../state/store/repository.ts");
  const f = await fixture();
  const state = (await loadState(f.second.home))!;
  const path = join(f.checkoutB.root, ".env.new");
  await atomicWrite(path, "TOKEN=unpublished\n", fixtureClock);

  await linkFile(
    f.second,
    state,
    f.checkoutB,
    f.second.placement("copy", f.checkoutB.root),
    ".env.new",
  );

  await saveState(f.second.home, state, fixtureClock);
  await rm(state.links[0]!.store);
  expect((await pull(f.second, f.opts)).conflicts).toBe(1);
  expect(await Bun.file(path).text()).toBe("TOKEN=unpublished\n");
});
