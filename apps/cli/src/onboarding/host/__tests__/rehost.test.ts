import { test, expect } from "bun:test";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createMemoryKeychainAdapter } from "@envden/testing/keychain";
import { createAdapters } from "../../../adapters.ts";
import { serviceDefinition } from "../../../agent/service/generate.ts";
import { serviceFile } from "../../../agent/service/location.ts";
import { emptyState } from "../../../state/model.ts";
import { atomicWrite } from "../../../state/store/files.ts";
import { loadState, saveState } from "../../../state/store/repository.ts";
import { runSetup } from "../../setup.ts";
import { hostedAddress } from "../rehost.ts";

const clock = () => 1800000000000;

async function rerun(installed: number | undefined, saved: string) {
  const root = await realpath(await mkdtemp(join(tmpdir(), "envden-rehost-")));

  const adapters = createAdapters(
    { home: join(root, "envden"), userHome: root, keychain: createMemoryKeychainAdapter([]) },
    clock,
  );

  const hosted: number[] = [];
  const exposed: number[] = [];

  adapters.serverPort = async () => 51234;

  adapters.hostServer = async (port) => {
    hosted.push(port);

    return { log: "", path: "" };
  };

  adapters.network = {
    ...adapters.network,
    expose: async (port) => {
      exposed.push(port);

      return `https://laptop.tail.ts.net:${port}`;
    },
  };

  const state = emptyState("laptop");
  state.vaultId = "vault";
  state.server = { address: saved, pin: "pin", protocol: 1 };
  await saveState(adapters.home, state, clock);

  if (installed !== undefined) {
    const { content } = serviceDefinition(
      process.platform,
      "/bin/envden",
      "/data",
      "/log",
      installed,
    );

    await atomicWrite(serviceFile(process.platform, root)!, content, clock);
  }

  try {
    await runSetup(
      adapters,
      { hostServer: true, scanRoot: [], telemetry: "off", agent: "off", shell: "none" },
      clock,
    );

    return { hosted, exposed, address: (await loadState(adapters.home))?.server?.address };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("rerunning setup --host-server keeps the installed port, so exposure and saved addresses hold", async () => {
  expect(await rerun(4783, "https://laptop.tail.ts.net:4783")).toEqual({
    hosted: [4783],
    exposed: [],
    address: "https://laptop.tail.ts.net:4783",
  });
});

test("a first install exposes the chosen port and moves this device's address only on the same host", async () => {
  expect(await rerun(undefined, "https://laptop.tail.ts.net:4783")).toEqual({
    hosted: [51234],
    exposed: [51234],
    address: "https://laptop.tail.ts.net:51234",
  });

  expect((await rerun(undefined, "https://homelab.tail.ts.net:4783")).address).toBe(
    "https://homelab.tail.ts.net:4783",
  );
});

test("only an address on this host follows the exposed port", () => {
  expect(hostedAddress("https://a.ts.net:4783", "https://a.ts.net:51234")).toBe(
    "https://a.ts.net:51234",
  );

  expect(hostedAddress("https://b.ts.net:4783", "https://a.ts.net:51234")).toBe(
    "https://b.ts.net:4783",
  );
});
