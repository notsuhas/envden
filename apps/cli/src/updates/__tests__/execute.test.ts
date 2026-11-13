import { test, expect, spyOn } from "bun:test";
import { managerUpdate } from "../self/execute.ts";
import { pinnedInstall } from "../self/paths.ts";

for (const [manager, binary, installer, replacement] of [
  [
    "brew",
    "/opt/homebrew/Cellar/envden/1/bin/envden",
    "/opt/homebrew/bin/brew",
    "/opt/homebrew/bin/envden",
  ],
  ["brew", "/usr/local/bin/envden", "/usr/local/bin/brew", "/usr/local/bin/envden"],
  [
    "npm",
    "/opt/node/lib/node_modules/envden/bin/envden",
    "/opt/node/bin/npm",
    "/opt/node/bin/envden",
  ],
  [
    "scoop",
    "C:/Users/me/scoop/apps/envden/1/envden.exe",
    "C:/Users/me/scoop/shims/scoop.cmd",
    "C:/Users/me/scoop/apps/envden/current/envden.exe",
  ],
  [
    "winget",
    "C:/Users/me/AppData/Local/Microsoft/WinGet/Packages/Envden_1/envden.exe",
    "C:/Users/me/AppData/Local/Microsoft/WindowsApps/winget.exe",
    "C:/Users/me/AppData/Local/Microsoft/WinGet/Links/envden.exe",
  ],
])
  test(`${manager} pins installer and replacement without PATH`, async () => {
    const calls: string[][] = [];

    await managerUpdate(
      [manager!, "upgrade", "envden"],
      binary!,
      async () => true,
      async (args) => {
        calls.push(args);
      },
    );

    expect(calls).toEqual([
      [installer!, "upgrade", "envden"],
      [replacement!, "update", "--post-install"],
    ]);

    expect(pinnedInstall(manager!, "/checkout/envden")).toBeUndefined();
    calls.length = 0;

    await managerUpdate(
      [manager!, "upgrade", "envden"],
      binary!,
      async () => false,
      async (args) => {
        calls.push(args);
      },
    );

    expect(calls).toEqual([]);
  });

test("an unpinned manager prints the manual command and executes nothing", async () => {
  const output = spyOn(console, "error").mockImplementation(() => {});

  try {
    expect(
      await managerUpdate(["npm", "i", "-g", "envden@latest"], "/checkout/envden", async () => {
        throw new Error("must not ask");
      }),
    ).toEqual({ kind: "manual" });

    expect(output.mock.calls.flat()).toContain(
      "envden: Cannot pin installer path. Run manually: npm i -g envden@latest",
    );
  } finally {
    output.mockRestore();
  }
});
