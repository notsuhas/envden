import { isToken } from "@envden/core/protocol";
import { expect, test, spyOn } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { testNetwork } from "@envden/server/testing";
import { createMemoryKeychainAdapter } from "@envden/testing/keychain";
import { createAdapters } from "../../adapters.ts";
import { fixture } from "../../admin/recovery/__tests__/fixture.ts";
import { setupVault } from "../setup.ts";
import { kitJoin } from "../recovery/kit.ts";
import { loadState, saveState } from "../../state/store/repository.ts";

const fixtureClock = () => 1800000000000;

for (const missing of ["epoch/1", "id-key", "device", "wrong-epoch", "expired", "write-fails"])
  test(`setup cannot commit without keys: ${missing}`, async () => {
    let timestamp = fixtureClock();
    const now = () => timestamp;
    const { network, running, token, home, cleanup } = await freshServer(now);

    try {
      const adapters = home("third");
      const originalSet = adapters.keychain.set.bind(adapters.keychain);

      if (missing === "write-fails")
        adapters.keychain.set = async (name, value) => {
          if (name.endsWith("/id-key")) throw new Error("Keychain unavailable");

          return originalSet(name, value);
        };

      const options = {
        address: running.server.url.toString(),
        token,
        name: "third",
        password: "password",
        now,
        fetcher: network.fetcher,
      };

      await Promise.resolve(
        expect(
          setupVault(adapters, {
            ...options,
            fetcher: async (input, init) => {
              if (
                new URL(input instanceof Request ? input.url : input.toString()).pathname ===
                "/v1/vault"
              )
                throw new Error("Before post");

              return network.fetcher(input, init);
            },
          }),
        ).rejects.toThrow(),
      );

      const pending = await loadState(adapters.home);

      if (missing === "write-fails") expect(pending).toBeUndefined();
      else {
        expect(pending?.creationPending).toBeDefined();

        await adapters.keychain.delete(`envden/${adapters.home}/${missing}`);
      }

      await replaceWrongEpoch(missing, originalSet, adapters.home);
      if (missing === "expired") timestamp += 120001;
      adapters.keychain.set = originalSet;
      const result = await setupVault(adapters, options);
      expect(result.state.creationPending).toBeUndefined();
      expect(await adapters.keychain.get(`envden/${adapters.home}/epoch/1`)).toBeDefined();
      expect(await adapters.keychain.get(`envden/${adapters.home}/id-key`)).toBeDefined();
      if (pending) expect(result.state.vaultId).not.toBe(pending.vaultId);
    } finally {
      await cleanup();
    }
  });

test("setup resumed without the first kit finishes the vault with a new kit", async () => {
  const { network, running, token, home, cleanup } = await freshServer(fixtureClock);
  const third = home("third");

  try {
    const issued: string[] = [];
    let lose = true;

    const options = {
      address: running.server.url.toString(),
      token,
      name: "third",
      password: "password",
      now: fixtureClock,
      onKit: async (kit: { secretKey: string }) => {
        issued.push(kit.secretKey);
      },
    };

    const lossy: typeof network.fetcher = async (input, init) => {
      const response = await network.fetcher(input, init);
      const path = new URL(input instanceof Request ? input.url : input.toString()).pathname;
      if (!lose || path !== "/v1/vault") return response;
      lose = false;

      throw new Error("Lost creation response");
    };

    await Promise.resolve(
      expect(setupVault(third, { ...options, fetcher: lossy })).rejects.toThrow(),
    );

    const result = await setupVault(third, {
      ...options,
      fetcher: network.fetcher,
      readResumeSecretKey: async () => undefined,
    });

    expect(result.state.creationPending).toBeUndefined();
    expect(issued).toEqual([expect.any(String), result.kit.secretKey]);

    const joined = await kitJoin(home("second"), {
      ...result.kit,
      address: options.address,
      password: "password",
      name: "second",
      now: fixtureClock,
      fetcher: network.fetcher,
    });

    expect(joined.vaultId).toBe(result.kit.vaultId);
  } finally {
    await cleanup();
  }
});

test("join refuses a foreign committed vault without changing state or keys", async () => {
  const f = await fixture();
  const second = f.home("second");

  try {
    const state = { ...f.result.state, vaultId: "foreign-vault", aliases: { old: "preserved" } };
    await saveState(second.home, state, fixtureClock);
    const key = new Uint8Array(32).fill(7);
    await second.keychain.set(`envden/${second.home}/id-key`, key);

    await Promise.resolve(
      expect(
        kitJoin(second, {
          address: f.result.kit.server,
          ...f.result.kit,
          password: "old password",
          name: "second",
          now: f.now,
          fetcher: f.fetcher,
        }),
      ).rejects.toMatchObject({ code: "CONFLICT" }),
    );

    expect(await loadState(second.home)).toEqual(state);
    expect(await second.keychain.get(`envden/${second.home}/id-key`)).toEqual(key);
  } finally {
    await f.close();
  }
});

async function replaceWrongEpoch(
  missing: string,
  set: (name: string, value: Uint8Array) => Promise<void>,
  home: string,
) {
  if (missing === "wrong-epoch") await set(`envden/${home}/epoch/1`, new Uint8Array(32).fill(7));
}

async function freshServer(now: () => number) {
  const root = await mkdtemp(join(tmpdir(), "envden-state-safety-"));
  const log = spyOn(console, "log").mockImplementation(() => {});
  const network = testNetwork();
  const running = await network.serve({ dataDir: join(root, "server"), port: 0, now });

  const token = log.mock.calls.flat().find((v) => isToken("setup", v));

  log.mockRestore();
  if (typeof token !== "string") throw new Error("Missing token");

  const home = (name: string) =>
    createAdapters(
      {
        fetcher: network.fetcher,
        home: join(root, name),
        userHome: join(root, name),
        keychain: createMemoryKeychainAdapter(["get", "set", "delete"]),
      },
      now,
    );

  const cleanup = async () => {
    await running.shutdown();
    await rm(root, { recursive: true, force: true });
  };

  return { network, running, token, home, cleanup };
}
