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

test("terminal error sink sanitizes scan diagnostics and thrown error text", async () => {
  const { spyOn } = await import("bun:test");
  const { withTerminalErrors } = await import("../errors.ts");
  const report = spyOn(console, "error").mockImplementation(() => {});

  try {
    await withTerminalErrors(async () => {
      console.error("%s: skipped: %s", "repo\x1b\x07", "failure\u202e");
      console.error(new Error("bad\x1b\x07").message);
    });

    expect(report.mock.calls).toEqual([["repo: skipped: failure"], ["bad"]]);
  } finally {
    report.mockRestore();
  }
});

test("selection wrappers reject unattended approval and file choices", async () => {
  const { choose, chooseMany } = await import("../prompts/questions.ts");
  const descriptor = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");

  try {
    Object.defineProperty(process.stdin, "isTTY", { configurable: true, value: false });

    await Promise.resolve(
      expect(choose("Version", [{ value: "store", label: "Use store" }])).rejects.toMatchObject({
        code: "INVALID_INPUT",
      }),
    );

    await Promise.resolve(
      expect(chooseMany("Approve", [])).rejects.toMatchObject({ code: "INVALID_INPUT" }),
    );
  } finally {
    if (descriptor) Object.defineProperty(process.stdin, "isTTY", descriptor);
    else Reflect.deleteProperty(process.stdin, "isTTY");
  }
});

for (const [code, exit] of [
  ["INVALID_INPUT", 2],
  ["NOT_IMPLEMENTED", 2],
  ["UNAUTHORIZED", 1],
  ["INTERNAL", 1],
] as const)
  test(`exit status for ${code}`, () => expect(errorExitCode(code)).toBe(exit));

test("stdout sanitizes device names and nested report paths", async () => {
  const { spyOn } = await import("bun:test");
  const { withTerminalErrors } = await import("../errors.ts");
  const log = spyOn(console, "log").mockImplementation(() => {});
  const table = spyOn(console, "table").mockImplementation(() => {});

  try {
    await withTerminalErrors(async () => {
      console.log("name\x1b\x07\n\tstatus");
      console.table([{ path: "repo\u202e/path" }]);
    });

    expect(log.mock.calls).toEqual([["name\n\tstatus"]]);
    expect(table.mock.calls).toEqual([[[{ path: "repo/path" }]]]);
  } finally {
    log.mockRestore();
    table.mockRestore();
  }
});
