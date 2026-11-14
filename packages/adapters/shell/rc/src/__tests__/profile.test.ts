import { test, expect } from "bun:test";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createRcShellAdapter } from "../adapter.ts";
import { powerShellProfile } from "../files/powershell-profile.ts";

test("PowerShell profile resolution uses trusted runner and redirected Documents", () => {
  const redirected = join(tmpdir(), "OneDrive", "Documents", "profile.ps1");
  const calls: string[] = [];

  const path = powerShellProfile((name, args) => {
    calls.push(name);

    expect(args).toEqual([
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "$PROFILE.CurrentUserCurrentHost",
    ]);

    if (name === "pwsh") throw new Error("missing");

    return redirected + "\r\n";
  });

  expect(calls).toEqual(["pwsh", "powershell"]);
  expect(path).toBe(redirected);

  expect(
    createRcShellAdapter("powershell", tmpdir(), undefined, undefined, () => path).rcPath(),
  ).toBe(redirected);

  expect(
    powerShellProfile(() => {
      throw new Error("missing");
    }),
  ).toBeUndefined();
});
