import { removeFile } from "../remove.ts";
import { expect, test } from "bun:test";
import { join } from "node:path";
import { rm } from "node:fs/promises";
import { atomicWrite } from "../../state/store/files.ts";
import { loadState, saveState } from "../../state/store/repository.ts";
import { pull, push } from "../engine.ts";
import { readRemoteNotice, remoteNotice } from "../../notice/remote.ts";
import { createSharedFixture } from "./shared-fixture.ts";

const syncFixture = createSharedFixture();

test("tombstones remove link records and do not require ignore permission", async () => {
  const f = await syncFixture();

  try {
    await pull(f.second, f.opts);
    await removeFile(f.first, join(f.checkout.root, ".env"), { yes: true, now: f.now });
    await push(f.first, f.opts);

    f.second.repo.ensureIgnored = async () => {
      throw new Error("tracked on branch");
    };

    expect((await pull(f.second, f.opts)).conflicts).toBe(0);
    expect((await loadState(f.second.home))!.links).toEqual([]);
  } finally {
    await f.cleanup();
  }
});

test("pull adopts an unjournaled store link", async () => {
  const f = await syncFixture();

  try {
    await pull(f.second, f.opts);
    const state = (await loadState(f.second.home))!;
    state.links = [];
    await saveState(f.second.home, state);
    await atomicWrite(f.aStore, "TOKEN=changed\n");
    await push(f.first, f.opts);
    expect((await pull(f.second, f.opts)).conflicts).toBe(0);
    expect((await loadState(f.second.home))!.links).toHaveLength(1);
  } finally {
    await f.cleanup();
  }
});

test("local-only files never appear in remote notices", async () => {
  const f = await syncFixture();

  try {
    const state = (await loadState(f.second.home))!;

    state.links.push({
      root: f.checkoutB.root,
      path: ".env",
      store: join(f.second.home, "store", "local"),
      mode: "copy",
      localOnly: true,
    });

    await saveState(f.second.home, state);
    expect((await remoteNotice(f.second, f.opts)).repos).toEqual([]);
    await pull(f.second, f.opts);
    expect((await readRemoteNotice(f.second.home))!.repos).toEqual([]);
  } finally {
    await f.cleanup();
  }
});

test("notice failure does not fail a committed push", async () => {
  const f = await syncFixture();

  try {
    await atomicWrite(f.aStore, "TOKEN=changed\n");
    await rm(join(f.first.home, "state", "remote-notice.json"), { force: true });
    const { mkdir } = await import("node:fs/promises");
    await mkdir(join(f.first.home, "state", "remote-notice.json"));
    expect((await push(f.first, f.opts)).kind).toBe("pushed");
  } finally {
    await f.cleanup();
  }
});

test("unpublished detached files can resolve while other files push", async () => {
  const f = await syncFixture();

  try {
    const { linkFile } = await import("../../links/file.ts");
    const { resolveConflict } = await import("../resolve.ts");
    const state = (await loadState(f.first.home))!;
    const destination = join(f.checkout.root, ".env.local");
    await atomicWrite(destination, "KEY=original\n");

    await linkFile(
      f.first,
      state,
      f.checkout,
      f.first.placement("link", f.checkout.root),
      ".env.local",
    );

    await saveState(f.first.home, state);
    await atomicWrite(destination, "KEY=detached\n");
    await atomicWrite(f.aStore, "TOKEN=other-change\n");
    const result = await push(f.first, f.opts);
    expect(result.conflicts).toBe(1);
    expect(result.changed).toBe(1);
    await resolveConflict(f.first, { file: ".env.local", choice: "keep-mine", now: f.now });
    expect((await push(f.first, f.opts)).conflicts).toBe(0);
    await pull(f.second, f.opts);
    expect(await Bun.file(join(f.checkoutB.root, ".env.local")).text()).toBe("KEY=detached\n");
  } finally {
    await f.cleanup();
  }
});
