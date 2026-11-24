import { isToken } from "@envden/core/protocol";
import { expect, test, spyOn } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { testNetwork } from "@envden/server/testing";
import { createMemoryKeychainAdapter } from "@envden/testing/keychain";
import { createAdapters } from "../../adapters.ts";
import { fixture } from "../../admin/recovery/__tests__/fixture.ts";
import { resumeCommittedSetup, setupVault } from "../setup.ts";
import { recoveryJoin } from "../recovery/join.ts";
import { loadState, saveState } from "../../state/store/repository.ts";

const fixtureClock = () => 1800000000000;

for (const missing of ["epoch/1", "id-key", "device", "wrong-epoch", "write-fails"])
  test(`setup cannot commit without keys: ${missing}`, async () => {
    const now = fixtureClock;
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
        now,
        fetcher: network.fetcher,
        onCode: async () => {},
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

test("a code that fails to reach the user stays pending, without a token, until one is delivered", async () => {
  const { network, running, token, home, cleanup } = await freshServer(fixtureClock);
  const third = home("third");

  try {
    const shown: string[] = [];

    const delivery = (fails: boolean) => async (code: string) => {
      shown.push(code);
      if (fails) throw new Error("code file already exists");
    };

    const options = {
      address: running.server.url.toString(),
      token,
      name: "third",
      now: fixtureClock,
      fetcher: network.fetcher,
    };

    await Promise.resolve(
      expect(setupVault(third, { ...options, onCode: delivery(true) })).rejects.toThrow(
        "already exists",
      ),
    );

    const resume = (fails: boolean) =>
      resumeCommittedSetup(third, {
        now: fixtureClock,
        fetcher: network.fetcher,
        onCode: delivery(fails),
      });

    await Promise.resolve(
      expect(resume(true)).rejects.toMatchObject({ code: "RECOVERY_CODE_REQUIRED" }),
    );

    expect((await loadState(third.home))?.creationPending).toBeDefined();

    const result = await resume(false);
    expect(result?.state.creationPending).toBeUndefined();
    expect(shown).toHaveLength(3);
    expect(await resume(false)).toBeUndefined();

    const join = (name: string, code: string) =>
      recoveryJoin(home(name), {
        address: options.address,
        code,
        name,
        now: fixtureClock,
        fetcher: network.fetcher,
      });

    for (const lost of shown.slice(0, 2))
      await Promise.resolve(
        expect(join("lost", lost)).rejects.toMatchObject({ code: "UNAUTHORIZED" }),
      );

    expect((await join("new", shown[2]!)).vaultId).toBe(result?.state.vaultId);
  } finally {
    await cleanup();
  }
});

test("a creation that never reached the server isn't resumed without a token", async () => {
  const { network, running, token, home, cleanup } = await freshServer(fixtureClock);
  const third = home("third");

  try {
    const blocked: typeof network.fetcher = async (input, init) => {
      const path = new URL(input instanceof Request ? input.url : input.toString()).pathname;
      if (path === "/v1/vault") throw new Error("Before post");

      return network.fetcher(input, init);
    };

    const options = {
      address: running.server.url.toString(),
      token,
      name: "third",
      now: fixtureClock,
    };

    await Promise.resolve(
      expect(
        setupVault(third, { ...options, fetcher: blocked, onCode: async () => {} }),
      ).rejects.toThrow(),
    );

    expect(
      await resumeCommittedSetup(third, {
        now: fixtureClock,
        fetcher: network.fetcher,
        onCode: async () => {},
      }),
    ).toBeUndefined();

    expect(
      (await setupVault(third, { ...options, fetcher: network.fetcher, onCode: async () => {} }))
        .state.creationPending,
    ).toBeUndefined();
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
        recoveryJoin(second, {
          address: f.result.address,
          code: f.result.code,
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
