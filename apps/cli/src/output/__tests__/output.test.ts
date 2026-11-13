import { VERSION } from "../../version.ts";
import { test, expect } from "bun:test";
import { sanitizeTerminal, terminalJson } from "../sanitize.ts";
import { telemetryPayload } from "../telemetry.ts";
import { errorExitCode } from "../exit-code.ts";

test("terminal strings strip C0, C1, escape and bidi controls", () => {
  const unsafe = "repo\x1b\x07\n\r\x9b\u202e\u2066\u061c/name";
  expect(sanitizeTerminal(unsafe)).toBe("repo/name");
  expect(JSON.parse(terminalJson({ path: unsafe }))).toEqual({ path: "repo/name" });
  expect(errorExitCode("CONFLICT")).toBe(3);
});

test("telemetry selects only allowed fields and valid counts", () => {
  const input = {
    command: "push" as const,
    success: false,
    errorCode: "CONFLICT" as const,
    changed: 2,
    conflicts: -1,
    repoId: "secret/repo",
    password: "secret",
  };

  const payload = telemetryPayload("install-id", input);

  expect(payload.properties).toEqual({
    distinct_id: "install-id",
    version: VERSION,
    os: process.platform,
    command: "push",
    success: false,
    error_code: "CONFLICT",
    changed: 2,
    $ip: null,
    $geoip_disable: true,
  });

  expect(JSON.stringify(payload)).not.toContain("secret");
});
