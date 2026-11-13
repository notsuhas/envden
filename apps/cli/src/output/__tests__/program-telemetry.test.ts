import { test, expect, spyOn } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createProgram } from "../../program.ts";
import { setConfig } from "../../settings/config.ts";

test("program reports non-sync success and failure only after opt-in", async () => {
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

    expect(requests).toHaveLength(2);
    expect(requests[0]).toMatchObject({ properties: { command: "version", success: true } });

    expect(requests[1]).toMatchObject({
      properties: { command: "config", success: false, error_code: "INVALID_INPUT" },
    });

    expect(JSON.stringify(requests)).not.toContain("private-arg");
    process.env.DO_NOT_TRACK = "1";
    await program.parseAsync(["node", "envden", "version"]);
    expect(requests).toHaveLength(2);
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
