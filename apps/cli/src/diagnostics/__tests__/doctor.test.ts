import { test, expect } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
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
        keychain: createMemoryKeychainAdapter(["ownerOnly"]),
      },
      fixtureClock,
    );

    adapters.network.status = async () => ({
      ready: true,
      running: true,
      loggedIn: true,
      httpsEnabled: false,
    });

    adapters.network.checkHttpsCertificate = async () => ({ kind: "https-disabled", message: "x" });
    await mkdir(join(home, "state"), { recursive: true });
    await writeFile(join(home, "state", "device.json"), "{");
    const result = await doctor(adapters, paths(home));
    expect(result.https.kind).toBe("https-disabled");
    expect(result.keys).toEqual({ location: "~", ownerOnly: true });
    expect(result.shells.every((shell) => shell.path.startsWith(home))).toBe(true);
    expect(result.templates).toEqual([]);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
