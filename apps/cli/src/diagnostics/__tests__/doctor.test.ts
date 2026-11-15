import { test, expect } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createMemoryKeychainAdapter } from "@envden/testing/keychain";
import { createAdapters } from "../../adapters.ts";
import { paths } from "../../settings/paths.ts";
import { doctor } from "../doctor.ts";

const fixtureClock = () => 1800000000000;

test("doctor uses injected adapters and explicit paths including HTTPS checks", async () => {
  const home = await mkdtemp(join(tmpdir(), "envden-doctor-"));

  try {
    const adapters = createAdapters(
      {
        home,
        userHome: home,
        keychain: createMemoryKeychainAdapter(["available"]),
      },
      fixtureClock,
    );

    adapters.network.status = async () => ({
      ready: true,
      running: true,
      loggedIn: true,
      httpsEnabled: false,
    });

    adapters.network.checkHttpsCertificate = async () => false;
    const result = await doctor(adapters, paths(home));
    expect(JSON.stringify(result, null, 2).split("\n").length).toBeGreaterThan(3);
    expect(result.https).toBe(false);
    expect(result.shells.every((shell) => shell.path.startsWith(home))).toBe(true);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
