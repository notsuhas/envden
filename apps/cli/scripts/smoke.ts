import { spawnTrusted } from "@envden/core/process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";

const binary = resolve(process.argv[2] ?? "apps/cli/dist/envden");
const home = await mkdtemp(join(tmpdir(), "envden-smoke-"));

try {
  for (const args of [["--version"], ["--help"], ["doctor", "--json"]]) {
    const child = spawnTrusted(binary, args, {
      env: {
        ENVDEN_HOME: home,
        ENVDEN_NO_UPDATE_CHECK: "1",
        ENVDEN_TELEMETRY: "0",
      },
      stdout: "pipe",
      stderr: "inherit",
    });
    const output = await new Response(child.stdout).text();
    const code = await child.exited;
    if (code !== 0) throw new Error(`Smoke failed: ${args.join(" ")} (${code})`);
    if (!output.trim()) throw new Error("Empty smoke output");
    if (args[0] === "doctor") JSON.parse(output);
    console.log(output);
  }
} finally {
  await rm(home, { recursive: true, force: true });
}
