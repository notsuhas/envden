import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { IPublicShare } from "@envden/core/adapters";
import { createFakeNetworkAdapter } from "@envden/testing/network";
import { receiveFile } from "../../receive/run.ts";
import { sendFile, type ISendProgress } from "../run.ts";

const DUMMY = "# not a real secret\nAPI_KEY=dummy-value\n";

const never = new Promise<never>(() => {});

// The listener reached directly on 127.0.0.1, standing in for the public address.
function loopback(closed: string[]) {
  return createFakeNetworkAdapter({
    openPublicShare: async (port, path): Promise<IPublicShare> => ({
      url: `http://127.0.0.1:${port}${path}`,
      ready: Promise.resolve("public"),
      ended: never,
      close: async () => void closed.push(path),
    }),
  });
}

function recorder(onLink: (link: string) => void = () => {}) {
  const events: string[] = [];

  const progress: ISendProgress = {
    opening: () => events.push("opening"),
    ready: (link) => {
      events.push("ready");
      onLink(link);
    },
    finished: (outcome) => events.push(outcome),
    failed: () => events.push("failed"),
  };

  return { events, progress };
}

async function withFile(run: (dir: string, path: string) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), "envden-send-"));

  try {
    await writeFile(join(dir, "source.env"), DUMMY);
    await run(dir, join(dir, "source.env"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("one receive gets the file, then the link and listener close", async () => {
  await withFile(async (dir, path) => {
    const closed: string[] = [];
    let link = "";
    const received = Promise.withResolvers<string>();
    const { events, progress } = recorder((value) => received.resolve((link = value)));

    const sending = sendFile(
      { network: loopback(closed) },
      { path, minutes: 10, now: () => 0, wait: () => never, stopped: never, progress },
    );

    const options = { link: await received.promise, out: "got.env", cwd: dir, interactive: false };

    const result = await receiveFile(
      { fetcher: fetch, now: () => 0 },
      { ...options, confirm: async () => true },
    );

    expect(await sending).toEqual({ kind: "claimed" });
    expect(result.kind).toBe("saved");
    expect(await readFile(join(dir, "got.env"), "utf8")).toBe(DUMMY);
    expect((await stat(join(dir, "got.env"))).mode & 0o777).toBe(0o600);
    expect(events).toEqual(["opening", "ready", "claimed"]);
    expect(closed).toHaveLength(1);
    expect(link).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/s\/[\w-]{22}#[\w-]{43}$/);
    await Promise.resolve(expect(fetch(link.replace(/#.*/, ""))).rejects.toThrow());
  });
});

test("the link expires on the injected clock, and a failed opening closes the listener", async () => {
  await withFile(async (_dir, path) => {
    const expired = recorder();

    const result = await sendFile(
      { network: loopback([]) },
      {
        path,
        minutes: 3,
        now: () => 0,
        wait: (ms) => (ms === 3 * 60_000 ? Promise.resolve() : never),
        stopped: never,
        progress: expired.progress,
      },
    );

    expect([result, expired.events]).toEqual([
      { kind: "expired" },
      ["opening", "ready", "expired"],
    ]);

    const failed = recorder();

    const refusing = createFakeNetworkAdapter({
      openPublicShare: async () => Promise.reject(new Error("refused")),
    });

    const sending = sendFile(
      { network: refusing },
      {
        path,
        minutes: 10,
        now: () => 0,
        wait: () => never,
        stopped: never,
        progress: failed.progress,
      },
    );

    await Promise.resolve(expect(sending).rejects.toThrow("refused"));
    expect(failed.events).toEqual(["opening", "failed"]);
  });
});
