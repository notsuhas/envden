import { test, expect } from "bun:test";
import { fixture } from "../../admin/recovery/__tests__/fixture.ts";
import { completeJoin } from "../complete-join.ts";
import { runSetup } from "../setup.ts";

test("completed setup skips credentials, kit and certificate prompts", async () => {
  const f = await fixture();

  try {
    f.first.network.checkHttpsCertificate = async () => {
      throw new Error("Repeated setup");
    };

    let hosted = 0;

    f.first.hostServer = async () => {
      hosted++;

      return { log: "test", path: "test" };
    };

    await runSetup(
      f.first,
      { hostServer: true, scanRoot: [], telemetry: "on", updateCheck: "off" },
      f.now,
    );

    expect(hosted).toBe(1);
    const { readConfig } = await import("../../settings/config.ts");

    expect(await readConfig(f.first.home)).toMatchObject({
      telemetry: true,
      "update-check": false,
    });
  } finally {
    await f.close();
  }
});

test("completeJoin scans before first sync and wires first-run choices", async () => {
  const f = await fixture();

  try {
    const calls: string[] = [];

    await completeJoin(f.first, f.now, {
      setupPreferences: async () => {
        calls.push("preferences");
      },
      setupCheckouts: async (adapters, state, options) => {
        expect(adapters).toBe(f.first);
        expect(state.vaultId).toBe(f.result.state.vaultId);
        expect(options.now).toBe(f.now);
        calls.push("scan");
      },
      firstRun: async (adapters, options) => {
        expect(adapters).toBe(f.first);
        expect(options).toMatchObject({ all: true, interactive: true, now: f.now, fetcher: fetch });
        expect(typeof options.choose).toBe("function");
        calls.push("sync");

        return { kind: "pulled", changed: 0, conflicts: 0 };
      },
    });

    expect(calls).toEqual(["preferences", "scan", "sync"]);
  } finally {
    await f.close();
  }
});

test("setup preferences persist only in config", async () => {
  const { setupPreferences } = await import("../preferences.ts");
  const { readConfig } = await import("../../settings/config.ts");
  const { emptyState } = await import("../../state/model.ts");
  const f = await fixture();

  try {
    const state = emptyState("test");
    const before = structuredClone(state);
    await setupPreferences(f.first, { telemetry: "on", updateCheck: "off", yes: true });
    expect(state).toEqual(before);

    expect(await readConfig(f.first.home)).toMatchObject({
      telemetry: true,
      "update-check": false,
    });
  } finally {
    await f.close();
  }
});

test("scan offers an empty checkout when its repo is already in the vault", async () => {
  const { join } = await import("node:path");
  const { mkdir } = await import("node:fs/promises");
  const { setupCheckouts } = await import("../scan.ts");
  const { pushInitialFiles } = await import("../../vault/initial/push.ts");
  const { saveState } = await import("../../state/store/repository.ts");
  const { atomicWrite } = await import("../../state/store/files.ts");
  const f = await fixture();

  try {
    const state = f.result.state;

    const source = {
      root: join(f.root, "source"),
      gitDir: join(f.root, "source", ".git"),
      repoId: "host/existing",
    };

    const store = join(f.first.home, "store", ".env");
    await atomicWrite(store, "PORT=1");
    state.approved.push(source);
    state.links.push({ root: source.root, path: ".env", store, mode: "link" });
    await saveState(f.first.home, state);
    await pushInitialFiles(f.first, state, f.now);

    const checkout = {
      root: join(f.root, "empty"),
      gitDir: join(f.root, "empty", ".git"),
      repoId: source.repoId,
    };

    await mkdir(checkout.gitDir, { recursive: true });
    f.first.repo.checkoutAt = async () => checkout;
    f.first.repo.worktrees = async () => [];
    f.first.repo.envFiles = async () => [];

    await setupCheckouts(f.first, state, {
      scanRoot: [checkout.root],
      approve: async () => true,
      now: f.now,
    });

    expect(state.approved.some((repo) => repo.root === checkout.root)).toBe(true);
  } finally {
    await f.close();
  }
});

test("interactive setup offers to host a server before credential entry", async () => {
  const { spyOn } = await import("bun:test");
  const questions = await import("../../output/questions.ts");
  const f = await fixture();
  const descriptor = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");
  const consent = spyOn(questions, "consent").mockResolvedValue(true);
  const secret = spyOn(questions, "secret").mockRejectedValue(new Error("stop after hosting"));

  try {
    Object.defineProperty(process.stdin, "isTTY", { configurable: true, value: true });
    const adapters = f.home("host-setup");
    adapters.network.checkHttpsCertificate = async () => true;
    adapters.network.expose = async () => "https://server.invalid";
    let hosted = 0;

    adapters.hostServer = async () => {
      hosted++;

      return { log: "test", path: "test" };
    };

    await Promise.resolve(
      expect(runSetup(adapters, {}, f.now)).rejects.toThrow("stop after hosting"),
    );

    expect(consent.mock.calls[0]?.[0]).toContain("Host the server on this machine?");
    expect(hosted).toBe(1);
  } finally {
    consent.mockRestore();
    secret.mockRestore();

    if (descriptor) Object.defineProperty(process.stdin, "isTTY", descriptor);
    else Reflect.deleteProperty(process.stdin, "isTTY");

    await f.close();
  }
});
