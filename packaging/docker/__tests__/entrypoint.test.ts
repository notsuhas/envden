import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const source = readFileSync(new URL("../entrypoint.sh", import.meta.url), "utf8");
const start = source.indexOf("attempt=0", source.indexOf("done"));
const end = source.indexOf("\ntimeout 5 tailscale serve", start);

// Runs the login section against a stub tailscale whose FAILING command exits 1.
function login(env: Record<string, string>) {
  const script = `set -eu
auth_key=\${TS_AUTHKEY:-}
sleep() { :; }
timeout() { printf 'timeout=%s\\n' "$1"; shift; "$@"; }
tailscale() {
  if [ "$1" = status ]; then printf '{"BackendState":"%s"}' "$STATE"; return; fi
  printf '%s\\n' "$@"
  [ "$1" != "\${FAILING:-}" ]
}
${source.slice(start, end)}
printf server-started`;

  const result = spawnSync("/bin/sh", ["-c", script], { env: { PATH: process.env.PATH, ...env } });

  return {
    status: result.status,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
}

if (process.platform !== "win32") {
  for (const state of ["Stopped", "NeedsLogin"])
    test(`tailscale applies hostname in ${state}`, () => {
      const result = login({ STATE: state, TS_HOSTNAME: "changed", TS_AUTHKEY: "test-only" });

      expect(result.status).toBe(0);

      expect(result.stdout).toStartWith(
        state === "NeedsLogin" ? "timeout=30\nup\n" : "timeout=5\nset\n",
      );

      expect(result.stdout).toContain("--hostname=changed");
      expect(result.stdout).toContain("--accept-dns=false");
      expect(result.stdout.includes("--auth-key=file:")).toBe(state === "NeedsLogin");
      expect(result.stdout).not.toContain("test-only");
    });

  test("login without a key fails clearly", () => {
    const result = login({ STATE: "NeedsLogin", TS_AUTHKEY: "" });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("TS_AUTHKEY");
  });

  test("NoState times out instead of attempting interactive login", () => {
    const result = login({ STATE: "NoState", TS_AUTHKEY: "test-only" });

    expect(result.status).not.toBe(0);
    expect(result.stdout).not.toContain("up\n");
    expect(result.stderr).toContain("timeout");
  });

  test("a logged-in preference failure still reaches server startup", () => {
    const result = login({ STATE: "Stopped", FAILING: "set" });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("server-started");
  });

  test("stopped backend resumes without credentials and tolerates a resume failure", () => {
    const result = login({ STATE: "Stopped", FAILING: "up" });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("timeout=30\nup\n");
    expect(result.stdout).not.toContain("--auth-key");
    expect(result.stdout).toContain("server-started");
  });

  test("tailscaled starts without the auth key in its environment", () => {
    const script = `set -eu
mkdir() { :; }
tailscaled() { env; }
${source.slice(source.indexOf(": "), source.indexOf("daemon=$!"))}
wait`;

    const result = spawnSync("/bin/sh", ["-c", script], {
      env: { PATH: process.env.PATH, TS_AUTHKEY: "tskey-secret" },
    });

    expect(result.status).toBe(0);
    expect(result.stdout.toString()).not.toContain("tskey-secret");
  });
}
