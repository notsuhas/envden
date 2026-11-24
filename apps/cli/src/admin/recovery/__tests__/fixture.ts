import { isToken } from "@envden/core/protocol";
import { spyOn } from "bun:test";
import { rmSync } from "node:fs";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { testNetwork } from "@envden/server/testing";
import { createFakeKeychainAdapter } from "@envden/testing/keychain";
import { createAdapters } from "../../../adapters.ts";
import { loadState, saveState } from "../../../state/store/repository.ts";
import { setupVault } from "../../../vault/setup.ts";
import { recoveryJoin } from "../../../vault/recovery/join.ts";

type TKeys = Map<string, Uint8Array>;

const start = 1800000000000;
const bases = new Map<string, ReturnType<typeof build>>();

// Each set of members is built once and copied per test, since a vault takes a server round trip per member.
export async function fixture(members: readonly string[] = []) {
  const key = members.join(",");
  let base = bases.get(key);

  if (!base) {
    base = build(members);
    bases.set(key, base);
  }

  return copy(await base);
}

function keychain(values: TKeys) {
  return createFakeKeychainAdapter({
    get: async (name) => values.get(name)?.slice(),
    set: async (name, value) => {
      values.set(name, value.slice());
    },
    delete: async (name) => {
      values.delete(name);
    },
  });
}

function adapters(root: string, name: string, fetcher: ReturnType<typeof testNetwork>["fetcher"]) {
  return (keys: TKeys, now: () => number) =>
    createAdapters(
      { fetcher, home: join(root, name), userHome: root, keychain: keychain(keys) },
      now,
    );
}

async function build(members: readonly string[]) {
  const root = await mkdtemp(join(tmpdir(), "envden-admin-base-"));
  const now = () => start;
  const log = spyOn(console, "log").mockImplementation(() => {});
  const { serve, fetcher } = testNetwork();
  const running = await serve({ dataDir: join(root, "server"), port: 0, now });

  const token = log.mock.calls.flat().find((v) => isToken("setup", v));

  log.mockRestore();
  if (typeof token !== "string") throw new Error("Missing setup token");
  process.on("exit", () => rmSync(root, { recursive: true, force: true }));
  const keys = new Map<string, TKeys>([["first", new Map()]]);

  const address = running.server.url.toString();
  let code = "";

  await setupVault(adapters(root, "first", fetcher)(keys.get("first")!, now), {
    address,
    token,
    name: "first",
    now,
    fetcher,
    onCode: async (shown) => {
      code = shown;
    },
  });

  for (const name of members) {
    keys.set(name, new Map());

    await recoveryJoin(adapters(root, name, fetcher)(keys.get(name)!, now), {
      address,
      code,
      name,
      now,
      fetcher,
    });
  }

  await running.shutdown();

  return { root, keys, code };
}

async function copy(base: Awaited<ReturnType<typeof build>>) {
  const root = await mkdtemp(join(tmpdir(), "envden-admin-"));
  let time = start;
  const now = () => time;
  const { serve, fetcher } = testNetwork();

  await cp(base.root, root, { recursive: true });
  const running = await serve({ dataDir: join(root, "server"), port: 0, now });
  const address = running.server.url.toString();

  // Keychain slots are named after the home path.
  const moved = (keys: TKeys) =>
    new Map([...keys].map(([slot, value]) => [slot.replaceAll(base.root, root), value]));

  const joined = Object.fromEntries(
    [...base.keys].map(([name, keys]) => [name, adapters(root, name, fetcher)(moved(keys), now)]),
  );

  for (const member of Object.values(joined)) {
    const state = (await loadState(member.home))!;
    state.server!.address = address;
    await saveState(member.home, state, now);
  }

  const first = joined.first!;
  const state = (await loadState(first.home))!;
  const result = { code: base.code, address, vaultId: state.vaultId!, state };

  const joinHome = (name: string, code = base.code) =>
    recoveryJoin(adapters(root, name, fetcher)(new Map(), now), {
      address,
      code,
      name,
      now,
      fetcher,
    });

  return {
    serve: (options: Parameters<typeof serve>[0]) =>
      serve({ ...options, now: options?.now ?? now }),
    fetcher,
    root,
    running,
    first,
    joined,
    result,
    now,
    advance: (milliseconds: number) => {
      time += milliseconds;
    },
    home: (name: string) => adapters(root, name, fetcher)(new Map(), now),
    joinHome,
    async close() {
      await running.shutdown();
      await rm(root, { recursive: true, force: true });
    },
  };
}
