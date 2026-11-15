import { expect, test, spyOn } from "bun:test";
import { pull } from "../engine.ts";
import { commandNotice } from "../../notice/command.ts";
import { withStateLock } from "../../state/lock/lock.ts";
import { readRemoteNotice, remoteNotice } from "../../notice/remote.ts";
import { noticeStatus } from "../../notice/cache.ts";
import { loadState } from "../../state/store/repository.ts";
import { createSharedFixture } from "./shared-fixture.ts";

const syncFixture = createSharedFixture();

test("background refresh fetches outside the state lock and locks only to write", async () => {
  const fixture = await syncFixture();
  let entered = () => {};
  let release = () => {};

  const ready = new Promise<void>((done) => {
    entered = done;
  });

  const gate = new Promise<void>((done) => {
    release = done;
  });

  let first = true;

  const refresh = commandNotice(
    fixture.second,
    fixture.now(),
    async (...args) => {
      if (first) {
        first = false;
        entered();
        await gate;
      }

      return fixture.fetcher(...args);
    },
    true,
  );

  try {
    await ready;

    expect(
      await withStateLock(fixture.second.home, async () => "available", {
        now: fixture.now,
        wait: async () => {},
        delays: [],
      }),
    ).toBe("available");

    release();
    await refresh;
    expect((await readRemoteNotice(fixture.second.home))?.checkedAt).toBe(fixture.now());
  } finally {
    release();
    await refresh;
    await fixture.cleanup();
  }
});

test("foreground commands inspect remote history even while the shell cache is fresh", async () => {
  const fixture = await syncFixture();
  const output = spyOn(console, "error").mockImplementation(() => {});
  const previous = process.env.ENVDEN_NO_UPDATE_CHECK;
  process.env.ENVDEN_NO_UPDATE_CHECK = "1";
  let requests = 0;

  try {
    await pull(fixture.second, fixture.opts);

    const fetcher = async (...args: Parameters<typeof fetch>) => {
      requests++;

      return fixture.fetcher(...args);
    };

    await commandNotice(fixture.second, fixture.now(), fetcher, true);
    expect(requests).toBe(0);
    await commandNotice(fixture.second, fixture.now(), fetcher, false);
    expect(requests).toBeGreaterThan(0);
    const foregroundRequests = requests;
    await commandNotice(fixture.second, fixture.now(), fetcher, false);
    expect(requests).toBeGreaterThan(foregroundRequests);
  } finally {
    if (previous === undefined) delete process.env.ENVDEN_NO_UPDATE_CHECK;
    else process.env.ENVDEN_NO_UPDATE_CHECK = previous;

    output.mockRestore();
    await fixture.cleanup();
  }
});

test("setup's initial push leaves nothing to pull and a pull settles the remote notice", async () => {
  const fixture = await syncFixture();

  try {
    expect((await remoteNotice(fixture.first, fixture.opts)).repos).toEqual([]);

    expect(await noticeStatus(fixture.first.home, (await loadState(fixture.first.home))!)).toEqual(
      [],
    );

    expect((await remoteNotice(fixture.second, fixture.opts)).repos).toEqual([
      "github.com/example/project",
    ]);

    await pull(fixture.second, fixture.opts);
    expect((await readRemoteNotice(fixture.second.home))?.repos).toEqual([]);
  } finally {
    await fixture.cleanup();
  }
});
