import { tokenKey, decodeToken, isToken } from "@envden/core/protocol";
import { pull } from "../../../sync/engine.ts";
import type { TFetch } from "../../../client/fetch.ts";
import { test, expect, spyOn } from "bun:test";
import { join } from "node:path";
import { fixture } from "../../recovery/__tests__/fixture.ts";
import { moveServer } from "../run.ts";
import { loadState } from "../../../state/store/repository.ts";
import { recoveryJoin } from "../../../vault/recovery/join.ts";

for (const crash of [false, true])
  test(`server move${crash ? " resumes after source commit" : " copies to another server"}`, async () => {
    const f = await fixture(["second"]);
    const log = spyOn(console, "log").mockImplementation(() => {});

    const destination = await f.serve({
      dataDir: join(f.first.userHome, "destination"),
      port: 0,
      now: f.now,
    });

    const token = log.mock.calls.flat().find((v) => isToken("setup", v));

    log.mockRestore();

    try {
      if (typeof token !== "string") throw new Error("Missing setup token");
      const other = f.joined.second!;
      const address = destination.server.url.toString();
      let failed = false;

      const fetcher: TFetch = async (input, init) => {
        const url = new URL(input instanceof Request ? input.url : String(input));

        if (
          crash &&
          !failed &&
          url.origin === new URL(address).origin &&
          url.pathname === "/v1/swap"
        ) {
          failed = true;
          throw new Error("Injected connection loss");
        }

        return f.fetcher(input, init);
      };

      if (crash) {
        await Promise.resolve(
          expect(
            moveServer(f.first, {
              address,
              token,
              now: f.now,
              fetcher,
            }),
          ).rejects.toBeInstanceOf(Error),
        );

        expect(failed).toBe(true);
      } else
        await moveServer(f.first, {
          address,
          token,
          now: f.now,
          fetcher,
        });

      if (crash) {
        await Promise.resolve(
          expect(
            moveServer(f.first, {
              abort: true,
              now: f.now,
              fetcher: f.fetcher,
            }),
          ).rejects.toMatchObject({ code: "MOVING" }),
        );

        await pull(other, {
          now: f.now,
          fetcher: f.fetcher,
          all: true,
        });

        expect((await loadState(other.home))?.server?.address).toBe(address);

        await moveServer(f.first, {
          resume: true,
          now: f.now,
          fetcher: f.fetcher,
        });
      }

      expect((await loadState(f.first.home))?.server?.address).toBe(address);
      expect(await Bun.file(join(f.first.home, "state", "move-pin")).exists()).toBe(false);

      await recoveryJoin(f.home("after-move"), {
        address,
        code: f.result.code,
        name: "after-move",
        now: f.now,
        fetcher: f.fetcher,
      });
    } finally {
      await destination.shutdown();
      await f.close();
    }
  });

test("aborting a prepared move discards the inactive destination and permits a fresh move", async () => {
  const f = await fixture();
  const log = spyOn(console, "log").mockImplementation(() => {});

  const destination = await f.serve({
    dataDir: join(f.root, "abort-destination"),
    port: 0,
    now: f.now,
  });

  const token = log.mock.calls.flat().find((v) => isToken("setup", v));

  try {
    if (typeof token !== "string") throw new Error("Missing setup token");
    const address = destination.server.url.toString();
    let stopped = false;

    const fetcher: TFetch = async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input));

      if (url.pathname === "/v1/swap" && url.origin === new URL(f.result.address).origin) {
        stopped = true;
        throw new Error("Crash before source commit");
      }

      return f.fetcher(input, init);
    };

    await Promise.resolve(
      expect(
        moveServer(f.first, {
          address,
          token,
          now: f.now,
          fetcher,
        }),
      ).rejects.toBeInstanceOf(Error),
    );

    expect(stopped).toBe(true);

    await moveServer(f.first, {
      abort: true,
      now: f.now,
      fetcher: f.fetcher,
    });

    expect(destination.storage.setupToken()).toBeUndefined();
    destination.storage.setSetupToken(tokenKey("setup", decodeToken("setup", token).secret));

    const renewed = token;

    await moveServer(f.first, {
      address,
      token: renewed,
      now: f.now,
      fetcher: f.fetcher,
    });

    expect((await loadState(f.first.home))?.server?.address).toBe(address);
    expect(await Bun.file(join(f.first.home, "state", "move-pin")).exists()).toBe(false);
  } finally {
    log.mockRestore();
    await destination.shutdown();
    await f.close();
  }
});

test("a stale recovery code refuses the move before consuming the destination token", async () => {
  const f = await fixture();
  const log = spyOn(console, "log").mockImplementation(() => {});

  const destination = await f.serve({
    dataDir: join(f.root, "refused-destination"),
    port: 0,
    now: f.now,
  });

  const token = log.mock.calls.flat().find((v) => isToken("setup", v));

  log.mockRestore();

  try {
    if (typeof token !== "string") throw new Error("Missing setup token");
    const vault = f.running.storage.vaultIds()[0]!;

    f.running.storage.configureVault(vault, {
      ...f.running.storage.vault(vault)!,
      proofRefused: true,
    });

    const setup = destination.storage.setupToken();

    await Promise.resolve(
      expect(
        moveServer(f.first, {
          address: destination.server.url.toString(),
          token,
          now: f.now,
          fetcher: f.fetcher,
        }),
      ).rejects.toMatchObject({ code: "RECOVERY_CODE_REQUIRED" }),
    );

    expect(destination.storage.setupToken()).toEqual(setup);
    expect(destination.storage.vaultIds()).toEqual([]);
    expect(f.running.storage.vault(vault)!.frozen).toBe(false);
  } finally {
    await destination.shutdown();
    await f.close();
  }
});
