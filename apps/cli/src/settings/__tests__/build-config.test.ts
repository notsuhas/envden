import { fileURLToPath } from "node:url";
import { spawnTrusted } from "@envden/core/process";
import { test, expect } from "bun:test";
import { TELEMETRY_KEY } from "../build-config.ts";

test("unconfigured builds disable telemetry despite runtime environment", async () => {
  expect(TELEMETRY_KEY).toBe("");

  const child = spawnTrusted(
    [
      process.execPath,
      "-e",
      'const { TELEMETRY_KEY } = await import("./apps/cli/src/settings/build-config.ts"); process.stdout.write(TELEMETRY_KEY)',
    ],
    {
      cwd: fileURLToPath(new URL("../../../../../", import.meta.url)),
      env: { ...process.env, ENVDEN_TELEMETRY_KEY: "runtime-only" },
      stdout: "pipe",
      stderr: "pipe",
    },
  );

  expect(await child.exited).toBe(0);
  expect(await new Response(child.stdout).text()).toBe("");
});

test("the bundled telemetry key is fixed at build time, not read at runtime", async () => {
  const build = await Bun.build({
    entrypoints: [fileURLToPath(new URL("../build-config.ts", import.meta.url))],
    target: "bun",
    define: { __ENVDEN_TELEMETRY_KEY__: JSON.stringify("phc_build-key") },
  });

  expect(build.success).toBe(true);
  const source = await build.outputs[0]!.text();

  const child = spawnTrusted(
    [process.execPath, "-e", source + "\nprocess.stdout.write(TELEMETRY_KEY);"],
    {
      env: { ...process.env, ENVDEN_TELEMETRY_KEY: "runtime-only" },
      stdout: "pipe",
      stderr: "pipe",
    },
  );

  expect(await child.exited).toBe(0);
  expect(await new Response(child.stdout).text()).toBe("phc_build-key");
});
