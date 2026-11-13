import { spyOn, setSystemTime } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serve } from "@envden/server";
import { createMemoryKeychainAdapter } from "@envden/testing/keychain";
import { createAdapters } from "../../../adapters.ts";
import { setupVault } from "../../../vault/setup.ts";
import { kitJoin } from "../../../vault/recovery/kit.ts";

export async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "envden-admin-"));
  const now = () => 1800000000000;
  setSystemTime(now());
  const log = spyOn(console, "log").mockImplementation(() => {});
  const running = await serve({ dataDir: join(root, "server"), port: 0 });

  const token = log.mock.calls
    .flat()
    .find((v) => typeof v === "string" && v.startsWith("envden-setup-1:"));

  log.mockRestore();
  if (typeof token !== "string") throw new Error("Missing setup token");

  const home = (name: string) =>
    createAdapters({
      home: join(root, name),
      userHome: root,
      keychain: createMemoryKeychainAdapter(["get", "set", "delete"]),
    });

  const first = home("first");

  const result = await setupVault(first, {
    address: running.server.url.toString(),
    token,
    name: "first",
    password: "old password",
    now,
    fetcher: fetch,
  });

  const joinHome = (name: string, kit = result.kit, password = "old password") =>
    kitJoin(home(name), {
      address: running.server.url.toString(),
      name,
      ...kit,
      password,
      now,
      fetcher: fetch,
    });

  return {
    root,
    running,
    first,
    result,
    now,
    home,
    joinHome,
    async close() {
      await running.server.stop(true);
      running.stopPruning();
      running.storage.close();
      setSystemTime();
      await rm(root, { recursive: true, force: true });
    },
  };
}
