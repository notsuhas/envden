import { expect, test, spyOn } from "bun:test";
import { join } from "node:path";
import { setupFlow } from "./setup-flow.ts";
import { setupVault } from "../setup.ts";
import { kitJoin } from "../recovery/kit.ts";
import { loadState, saveState } from "../../state/store/repository.ts";

const fixtureClock = () => 1800000000000;

for (const missing of [
  "epoch/1",
  "id-key",
  "both",
  "device",
  "wrong-epoch",
  "expired",
  "write-fails",
])
  test(`setup cannot commit without keys: ${missing}`, async () => {
    const f = await setupFlow();
    let timestamp = f.now();
    const now = () => timestamp;
    const { network, running, token } = await freshServer(f.root, now);

    try {
      const adapters = f.third;
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

        for (const key of missing === "both" ? ["epoch/1", "id-key", "device"] : [missing])
          await adapters.keychain.delete(`envden/${adapters.home}/${key}`);
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
      await running.shutdown();
      await f.cleanup();
    }
  });

test("setup resumed without the first kit finishes the vault with a new kit", async () => {
  const f = await setupFlow();
  const { network, running, token } = await freshServer(f.root, f.now);

  try {
    const issued: string[] = [];
    let lose = true;

    const options = {
      address: running.server.url.toString(),
      token,
      name: "third",
      password: "password",
      now: f.now,
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
      expect(setupVault(f.third, { ...options, fetcher: lossy })).rejects.toThrow(),
    );

    const result = await setupVault(f.third, {
      ...options,
      fetcher: network.fetcher,
      readResumeSecretKey: async () => undefined,
    });

    expect(result.state.creationPending).toBeUndefined();
    expect(issued).toEqual([expect.any(String), result.kit.secretKey]);

    const joined = await kitJoin(f.second, {
      ...result.kit,
      address: options.address,
      password: "password",
      name: "second",
      now: f.now,
      fetcher: network.fetcher,
    });

    expect(joined.vaultId).toBe(result.kit.vaultId);
  } finally {
    await running.shutdown();
    await f.cleanup();
  }
});

test("join refuses a foreign committed vault without changing state or keys", async () => {
  const f = await setupFlow();

  try {
    const state = { ...f.result.state, vaultId: "foreign-vault", aliases: { old: "preserved" } };
    await saveState(f.second.home, state, fixtureClock);
    const key = new Uint8Array(32).fill(7);
    await f.second.keychain.set(`envden/${f.second.home}/id-key`, key);

    await Promise.resolve(
      expect(
        kitJoin(f.second, {
          address: f.address,
          ...f.result.kit,
          password: "master password",
          name: "second",
          now: f.now,
          fetcher: f.fetcher,
        }),
      ).rejects.toMatchObject({ code: "CONFLICT" }),
    );

    expect(await loadState(f.second.home)).toEqual(state);
    expect(await f.second.keychain.get(`envden/${f.second.home}/id-key`)).toEqual(key);
  } finally {
    await f.cleanup();
  }
});

async function replaceWrongEpoch(
  missing: string,
  set: (name: string, value: Uint8Array) => Promise<void>,
  home: string,
) {
  if (missing === "wrong-epoch") await set(`envden/${home}/epoch/1`, new Uint8Array(32).fill(7));
}

async function freshServer(root: string, now: () => number) {
  const log = spyOn(console, "log").mockImplementation(() => {});
  const { testNetwork } = await import("@envden/server/testing");
  const network = testNetwork();
  const running = await network.serve({ dataDir: join(root, "fresh-server"), port: 0, now });

  const token = log.mock.calls
    .flat()
    .find((v) => typeof v === "string" && v.startsWith("envden-setup-1:"));

  log.mockRestore();
  if (typeof token !== "string") throw new Error("Missing token");

  return { network, running, token };
}
