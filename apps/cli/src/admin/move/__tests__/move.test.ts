import { pull } from "../../../sync/engine.ts";
import { login } from "../../../session/login.ts";
import type { TFetch } from "../../../client/fetch.ts";
import { test, expect, spyOn } from "bun:test";
import { join } from "node:path";
import { serve } from "@envden/server";
import { fixture } from "../../recovery/__tests__/fixture.ts";
import { moveServer } from "../run.ts";
import { loadState } from "../../../state/repository.ts";
import { kitJoin } from "../../../vault/recovery/kit.ts";

for (const crash of [false, true])
  test(`server move${crash ? " resumes after source commit" : " copies to another server"}`, async () => {
    const f = await fixture();
    const log = spyOn(console, "log").mockImplementation(() => {});
    const destination = await serve({ dataDir: join(f.first.userHome, "destination"), port: 0 });

    const token = log.mock.calls
      .flat()
      .find((v) => typeof v === "string" && v.startsWith("envden-setup-1:"));

    log.mockRestore();

    try {
      if (typeof token !== "string") throw new Error("Missing setup token");
      const other = f.home("other");

      await kitJoin(other, {
        ...f.result.kit,
        address: f.result.kit.server,
        password: "old password",
        name: "other",
        now: f.now,
        fetcher: fetch,
      });

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

        return fetch(input, init);
      };

      if (crash) {
        try {
          await moveServer(f.first, {
            address,
            token,
            password: "old password",
            now: f.now,
            fetcher,
          });
        } catch (error) {
          expect(error).toBeInstanceOf(Error);
        }
      } else
        await moveServer(f.first, {
          address,
          token,
          password: "old password",
          now: f.now,
          fetcher,
        });

      if (crash) {
        await Promise.resolve(
          expect(
            moveServer(f.first, {
              abort: true,
              password: "old password",
              now: f.now,
              fetcher: fetch,
            }),
          ).rejects.toMatchObject({ code: "MOVING" }),
        );

        await pull(other, {
          now: f.now,
          fetcher: fetch,
          all: true,
          unlock: async (client, vault) => {
            await login(client, vault, "old password");
          },
        });

        expect((await loadState(other.home))?.server?.address).toBe(address);

        await moveServer(f.first, {
          resume: true,
          password: "old password",
          now: f.now,
          fetcher: fetch,
        });
      }

      expect((await loadState(f.first.home))?.server?.address).toBe(address);

      await kitJoin(f.home("after-move"), {
        ...f.result.kit,
        address,
        password: "old password",
        name: "after-move",
        now: f.now,
        fetcher: fetch,
      });
    } finally {
      await destination.server.stop(true);
      destination.stopPruning();
      destination.storage.close();
      await f.close();
    }
  });

test("aborting a prepared move discards the inactive destination and permits a fresh move", async () => {
  const f = await fixture();
  const log = spyOn(console, "log").mockImplementation(() => {});
  const destination = await serve({ dataDir: join(f.root, "abort-destination"), port: 0 });

  const token = log.mock.calls
    .flat()
    .find((v) => typeof v === "string" && v.startsWith("envden-setup-1:"));

  try {
    if (typeof token !== "string") throw new Error("Missing setup token");
    const address = destination.server.url.toString();
    let stopped = false;

    const fetcher: TFetch = async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input));

      if (url.pathname === "/v1/swap" && url.origin === new URL(f.result.kit.server).origin) {
        stopped = true;
        throw new Error("Crash before source commit");
      }

      return fetch(input, init);
    };

    try {
      await moveServer(f.first, { address, token, password: "old password", now: f.now, fetcher });
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
    }

    expect(stopped).toBe(true);

    await moveServer(f.first, {
      abort: true,
      password: "old password",
      now: f.now,
      fetcher: fetch,
    });

    const renewed = log.mock.calls
      .flat()
      .filter((value) => typeof value === "string" && value.startsWith("envden-setup-1:"))
      .at(-1);

    if (typeof renewed !== "string") throw new Error("Missing renewed setup token");

    await moveServer(f.first, {
      address,
      token: renewed,
      password: "old password",
      now: f.now,
      fetcher: fetch,
    });

    expect((await loadState(f.first.home))?.server?.address).toBe(address);
  } finally {
    log.mockRestore();
    await destination.server.stop(true);
    destination.stopPruning();
    destination.storage.close();
    await f.close();
  }
});
