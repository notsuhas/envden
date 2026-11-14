import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const source = readFileSync(new URL("../entrypoint.sh", import.meta.url), "utf8");
const start = source.indexOf("attempt=0", source.indexOf("done"));
const end = source.indexOf("\ntimeout 5 tailscale serve", start);

if (process.platform !== "win32")
  for (const failure of [0, 1])
    test(`stopped backend resumes without credentials and tolerates failure ${failure}`, () => {
      const script = `set -eu
sleep() { :; }
timeout() { printf 'timeout=%s\\n' "$1"; shift; "$@"; }
tailscale() {
  if [ "$1" = status ]; then printf '{"BackendState":"Stopped"}';
  else printf '%s\\n' "$@"; if [ "$1" = up ]; then return ${failure}; fi; fi
}
${source.slice(start, end)}
printf server-started`;

      const result = spawnSync("/bin/sh", ["-c", script]);
      const output = result.stdout?.toString() ?? "";
      expect(result.status).toBe(0);
      expect(output).toContain("timeout=30\nup\n");
      expect(output).not.toContain("--auth-key");
      expect(output).toContain("server-started");
    });
