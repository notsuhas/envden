import { test, expect } from "bun:test";
import { fixture } from "../../admin/recovery/__tests__/fixture.ts";
import { runSetup } from "../setup.ts";

const fixtureClock = () => 1800000000000;

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

test("setup preferences persist only in config", async () => {
  const { setupPreferences } = await import("../preferences.ts");
  const { readConfig } = await import("../../settings/config.ts");
  const f = await fixture();

  try {
    await setupPreferences(f.first, { telemetry: "on", updateCheck: "off", yes: true });

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
    await atomicWrite(store, "PORT=1", fixtureClock);
    state.approved.push(source);
    state.links.push({ root: source.root, path: ".env", store, mode: "link" });
    await saveState(f.first.home, state, fixtureClock);
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

    const absent = {
      root: join(f.root, "absent"),
      gitDir: join(f.root, "absent", ".git"),
      repoId: "host/absent",
    };

    await mkdir(absent.gitDir, { recursive: true });
    f.first.repo.checkoutAt = async () => absent;

    await setupCheckouts(f.first, state, {
      scanRoot: [absent.root],
      approve: async () => true,
      now: f.now,
    });

    expect(state.approved.some((repo) => repo.root === absent.root)).toBe(false);
  } finally {
    await f.close();
  }
});

test("interactive setup hosts a server and takes its setup token without asking", async () => {
  const { spyOn } = await import("bun:test");
  const questions = await import("../../output/prompts/questions.ts");
  const f = await fixture();
  const descriptor = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");
  const consent = spyOn(questions, "consent").mockResolvedValue(true);
  const secret = spyOn(questions, "secret").mockRejectedValue(new Error("stop after hosting"));

  try {
    Object.defineProperty(process.stdin, "isTTY", { configurable: true, value: true });
    const adapters = f.home("host-setup");
    adapters.network.checkHttpsCertificate = async () => ({ kind: "ready" });
    adapters.network.expose = async () => "https://server.invalid";
    let hosted = 0;

    adapters.hostServer = async () => {
      hosted++;

      return { log: "test", path: "test" };
    };

    await Promise.resolve(
      expect(runSetup(adapters, { name: "laptop" }, f.now)).rejects.toThrow("stop after hosting"),
    );

    expect(consent.mock.calls[0]?.[0]).toContain("Host the server on this machine?");
    expect(hosted).toBe(1);
    expect(secret.mock.calls[0]?.[0]).toBe("Master password");
  } finally {
    consent.mockRestore();
    secret.mockRestore();

    if (descriptor) Object.defineProperty(process.stdin, "isTTY", descriptor);
    else Reflect.deleteProperty(process.stdin, "isTTY");

    await f.close();
  }
});

test("setup checks the address and token against the server before the name and password", async () => {
  const { spyOn } = await import("bun:test");
  const p = await import("@envden/core/protocol");
  const questions = await import("../../output/prompts/questions.ts");
  const f = await fixture();
  const asked = new Error("asked a question");
  const input = spyOn(questions, "input").mockRejectedValue(asked);
  const secret = spyOn(questions, "secret").mockRejectedValue(asked);
  const server = f.running.server.url.host;
  const token = p.encodeToken("setup", p.randomBytes(20), p.randomBytes(32));

  try {
    const adapters = f.home("early");
    adapters.network.checkHttpsCertificate = async () => ({ kind: "ready" });

    await Promise.resolve(
      expect(
        runSetup(adapters, { server: `http://${server}`, setupToken: token }, f.now),
      ).rejects.toThrow("This setup token is for a different server"),
    );

    await Promise.resolve(
      expect(runSetup(adapters, { server, setupToken: token }, f.now)).rejects.toThrow(
        `Can't reach https://${server}. Check the address and that the server is running`,
      ),
    );

    expect(input).not.toHaveBeenCalled();
    expect(secret).not.toHaveBeenCalled();
  } finally {
    input.mockRestore();
    secret.mockRestore();
    await f.close();
  }
});
