import { spawnTrusted } from "@envden/core/process";
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const entrypoint = readFileSync(
  new URL("../../../../packaging/docker/entrypoint.sh", import.meta.url),
  "utf8",
);

const start = entrypoint.indexOf("if tailscale status");
const end = entrypoint.indexOf("\ntailscale serve", start);

const script = `
set -eu
tailscale() {
  if [ "$1" = status ]; then printf '{"BackendState":"%s"}' "$STATE"; else printf '%s\\n' "$@"; fi
}
${entrypoint.slice(start, end)}
`;

if (process.platform !== "win32") {
  for (const state of ["NoState", "Stopped", "Running", "NeedsLogin"])
    test(`tailscale up applies hostname in ${state}`, () => {
      const result = spawnTrusted("sh", ["-c", script], {
        sync: true,
        env: { ...process.env, STATE: state, TS_HOSTNAME: "changed", TS_AUTHKEY: "test-only" },
      });

      const output = result.stdout?.toString() ?? "";
      expect(result.exitCode).toBe(0);
      expect(output).toStartWith("up\n");
      expect(output).toContain("--hostname=changed");
      expect(output).toContain("--accept-dns=false");
      expect(output.includes("--auth-key=file:")).toBe(state === "NeedsLogin");
      expect(output).not.toContain("test-only");
    });

  test("login without a key fails clearly", () => {
    const result = spawnTrusted("sh", ["-c", script], {
      sync: true,
      env: { ...process.env, STATE: "NeedsLogin", TS_AUTHKEY: "" },
    });

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr?.toString()).toContain("Set TS_AUTHKEY");
  });
}
