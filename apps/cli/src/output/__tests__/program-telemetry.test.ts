import { test, expect, spyOn } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createProgram } from "../../program.ts";
import { setConfig } from "../../settings/config.ts";

test("runtime environment cannot enable telemetry in an unconfigured build", async () => {
  const root = await mkdtemp(join(tmpdir(), "envden-telemetry-"));
  const names = ["ENVDEN_HOME", "ENVDEN_TELEMETRY_KEY", "ENVDEN_TELEMETRY", "DO_NOT_TRACK"];
  const original = names.map((name) => process.env[name]);
  const requests: unknown[] = [];

  const network = spyOn(globalThis, "fetch").mockImplementation(
    Object.assign(
      async (_input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        if (typeof init?.body !== "string") throw new Error("Expected JSON telemetry");
        requests.push(JSON.parse(init.body));

        return new Response();
      },
      { preconnect: fetch.preconnect },
    ),
  );

  const log = spyOn(console, "log").mockImplementation(() => {});

  try {
    process.env.ENVDEN_HOME = root;
    process.env.ENVDEN_TELEMETRY_KEY = "test-project";
    delete process.env.ENVDEN_TELEMETRY;
    delete process.env.DO_NOT_TRACK;
    const program = createProgram();
    await program.parseAsync(["node", "envden", "version"]);
    expect(requests).toHaveLength(0);
    await setConfig("telemetry", "on", root);
    await program.parseAsync(["node", "envden", "version"]);

    await Promise.resolve(
      expect(program.parseAsync(["node", "envden", "config", "private-arg"])).rejects.toMatchObject(
        { code: "INVALID_INPUT" },
      ),
    );

    expect(requests).toHaveLength(0);
    process.env.DO_NOT_TRACK = "1";
    await program.parseAsync(["node", "envden", "version"]);
    expect(requests).toHaveLength(0);
  } finally {
    network.mockRestore();
    log.mockRestore();

    names.forEach((name, index) => {
      const value = original[index];

      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    });

    await rm(root, { recursive: true, force: true });
  }
});

test("status succeeds while another command owns the state lock", async () => {
  const { withStateLock } = await import("../../state/lock/lock.ts");
  const root = await mkdtemp(join(tmpdir(), "envden-busy-status-"));
  const previous = process.env.ENVDEN_HOME;
  const log = spyOn(console, "log").mockImplementation(() => {});
  let release = () => {};
  let entered = () => {};

  const ready = new Promise<void>((resolve) => {
    entered = resolve;
  });

  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });

  const running = withStateLock(root, async () => {
    entered();
    await gate;
  });

  try {
    await ready;
    process.env.ENVDEN_HOME = root;
    await createProgram().parseAsync(["node", "envden", "status"]);
    expect(log.mock.calls.flat()).toContain("envden: not configured");
  } finally {
    release();
    await running;
    log.mockRestore();

    if (previous === undefined) delete process.env.ENVDEN_HOME;
    else process.env.ENVDEN_HOME = previous;

    await rm(root, { recursive: true, force: true });
  }
});

test("ordinary status reads cached notices without a network request", async () => {
  const { saveState } = await import("../../state/store/repository.ts");
  const { emptyState } = await import("../../state/model.ts");
  const { releaseConfig } = await import("../../updates/release-config.ts");
  const trust = releaseConfig.trust;
  const root = await mkdtemp(join(tmpdir(), "envden-local-status-"));
  const previous = process.env.ENVDEN_HOME;
  const log = spyOn(console, "log").mockImplementation(() => {});

  const network = spyOn(globalThis, "fetch").mockImplementation(
    Object.assign(
      async () => {
        throw new Error("network forbidden");
      },
      { preconnect: fetch.preconnect },
    ),
  );

  try {
    releaseConfig.trust = {
      generation: 1,
      keys: { primary: new Uint8Array(32), backup: new Uint8Array(32) },
    };

    process.env.ENVDEN_HOME = root;
    await saveState(root, emptyState("test"));
    await createProgram().parseAsync(["node", "envden", "status"]);
    expect(network).not.toHaveBeenCalled();
  } finally {
    releaseConfig.trust = trust;
    log.mockRestore();
    network.mockRestore();

    if (previous === undefined) delete process.env.ENVDEN_HOME;
    else process.env.ENVDEN_HOME = previous;

    await rm(root, { recursive: true, force: true });
  }
});

test("shell cache refresh records an unapproved cwd without terminal output", async () => {
  const { saveState } = await import("../../state/store/repository.ts");
  const { emptyState } = await import("../../state/model.ts");
  const { writeFile, readFile, mkdir, realpath } = await import("node:fs/promises");
  const root = await mkdtemp(join(tmpdir(), "envden-shell-offer-"));

  try {
    const checkout = join(root, "checkout");
    const home = join(root, "home");
    await mkdir(checkout);

    for (const args of [
      ["init", "--quiet"],
      ["remote", "add", "origin", "https://example.com/team/repo.git"],
    ]) {
      const git = Bun.spawn(["git", "-C", checkout, ...args], { stdout: "ignore", stderr: "pipe" });
      expect(await git.exited).toBe(0);
    }

    await writeFile(join(checkout, ".gitignore"), ".env\n");
    await writeFile(join(checkout, ".env"), "KEY=value\n");
    await saveState(home, emptyState("test"));

    const cli = Bun.spawn(
      ["bun", new URL("../../main.ts", import.meta.url).pathname, "status", "--refresh-cache"],
      { cwd: checkout, env: { ...process.env, ENVDEN_HOME: home }, stdout: "pipe", stderr: "pipe" },
    );

    expect(await cli.exited).toBe(0);
    expect(await new Response(cli.stdout).text()).toBe("");

    expect(await readFile(join(home, "state", "track-offers"), "utf8")).toBe(
      (await realpath(checkout)) + "\n",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
