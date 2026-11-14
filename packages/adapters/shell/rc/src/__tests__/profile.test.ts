import { test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createRcShellAdapter } from "../adapter.ts";
import { powerShellProfile } from "../files/powershell-profile.ts";

test("PowerShell profile resolution uses trusted runner and redirected Documents", () => {
  const redirected = join(tmpdir(), "OneDrive", "Documents", "Microsoft.PowerShell_profile.ps1");
  const calls: string[] = [];

  const path = powerShellProfile((name, args, options) => {
    calls.push(name);
    expect(options?.timeout).toBe(5000);

    expect(args).toEqual([
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "$PROFILE.CurrentUserCurrentHost",
    ]);

    if (name === "pwsh") throw new Error("missing");

    return redirected + "\r\n";
  }, tmpdir());

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

test("PowerShell validates profile paths and resolves once per adapter", () => {
  let calls = 0;

  const adapter = createRcShellAdapter("powershell", tmpdir(), undefined, undefined, () => {
    calls++;

    return join(tmpdir(), "Documents", "Microsoft.PowerShell_profile.ps1");
  });

  expect(adapter.rcPath()).toBe(adapter.rcPath());
  expect(calls).toBe(1);
  expect(powerShellProfile(() => join(tmpdir(), "..", "outside.ps1"), tmpdir())).toBeUndefined();
});

test("PowerShell prefers an existing envden hook over the first executable", () => {
  const home = mkdtempSync(join(tmpdir(), "envden-profile-"));
  const modern = join(home, "Documents", "PowerShell", "Microsoft.PowerShell_profile.ps1");
  const legacy = join(home, "Documents", "WindowsPowerShell", "Microsoft.PowerShell_profile.ps1");

  try {
    mkdirSync(join(home, "Documents", "WindowsPowerShell"), { recursive: true });
    writeFileSync(legacy, "# >>> envden >>>");
    expect(powerShellProfile((name) => (name === "pwsh" ? modern : legacy), home)).toBe(legacy);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("PowerShell accepts redirected profiles outside home and rejects unsafe output", () => {
  const profile = join(tmpdir(), "redirected", "Microsoft.PowerShell_profile.ps1");
  expect(powerShellProfile(() => profile, join(tmpdir(), "home"))).toBe(profile);

  for (const path of [
    "relative/Microsoft.PowerShell_profile.ps1",
    profile.replace("redirected", "bad\u0000path"),
    profile + "/extra",
    profile.replace("redirected", "bad\tpath"),
  ])
    expect(powerShellProfile(() => path, join(tmpdir(), "home"))).toBeUndefined();
});
