import { spawnTrusted } from "@envden/core/process";
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const entrypoint = readFileSync(
  new URL("../../../../packaging/docker/entrypoint.sh", import.meta.url),
  "utf8",
);

const start = entrypoint.indexOf("attempt=0", entrypoint.indexOf("done"));
const end = entrypoint.indexOf("\ntimeout 5 tailscale serve", start);

const script = `
set -eu
auth_key=\${TS_AUTHKEY:-}
sleep() { :; }
timeout() { shift; "$@"; }
tailscale() {
  if [ "$1" = status ]; then printf '{"BackendState":"%s"}' "$STATE"; else printf '%s\\n' "$@"; return "\${SET_FAILURE:-0}"; fi
}
${entrypoint.slice(start, end)}
`;

if (process.platform !== "win32") {
  for (const state of ["Stopped", "Running", "NeedsLogin"])
    test(`tailscale applies hostname in ${state}`, () => {
      const result = spawnTrusted("sh", ["-c", script], {
        sync: true,
        env: { ...process.env, STATE: state, TS_HOSTNAME: "changed", TS_AUTHKEY: "test-only" },
      });

      const output = result.stdout?.toString() ?? "";
      expect(result.exitCode).toBe(0);
      expect(output).toStartWith(state === "NeedsLogin" ? "up\n" : "set\n");
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

if (process.platform !== "win32")
  test("NoState times out instead of attempting interactive login", () => {
    const result = spawnTrusted("sh", ["-c", script], {
      sync: true,
      env: { ...process.env, STATE: "NoState", TS_AUTHKEY: "test-only" },
    });

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr?.toString()).toContain("Tailscale backend timeout");
  });

if (process.platform !== "win32")
  test("a logged-in preference failure still reaches server startup", () => {
    const result = spawnTrusted("sh", ["-c", script + "\nprintf server-started"], {
      sync: true,
      env: { ...process.env, STATE: "Stopped", SET_FAILURE: "1" },
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout?.toString()).toContain("server-started");
  });
