import { test, expect } from "bun:test";
import { stableExecutable } from "../self/paths.ts";

for (const [executable, stable] of [
  ["/opt/homebrew/Cellar/envden/0.2.0/bin/envden", "/opt/homebrew/bin/envden"],
  ["/usr/local/Cellar/envden/0.2.0/bin/envden", "/usr/local/bin/envden"],
  [
    "/home/linuxbrew/.linuxbrew/Cellar/envden/0.2.0/bin/envden",
    "/home/linuxbrew/.linuxbrew/bin/envden",
  ],
  ["/opt/homebrew/opt/envden/bin/envden", "/opt/homebrew/bin/envden"],
  [
    "C:\\Users\\me\\scoop\\apps\\envden\\0.2.0\\envden.exe",
    "C:\\Users\\me\\scoop\\apps\\envden\\current\\envden.exe",
  ],
  [
    "C:\\Users\\me\\scoop\\apps\\envden\\current\\envden.exe",
    "C:\\Users\\me\\scoop\\apps\\envden\\current\\envden.exe",
  ],
  ["/Users/me/.envden/bin/envden", "/Users/me/.envden/bin/envden"],
  [
    "/usr/local/lib/node_modules/envden/bin/envden",
    "/usr/local/lib/node_modules/envden/bin/envden",
  ],
  [
    "C:\\Users\\me\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Envden_1\\envden.exe",
    "C:\\Users\\me\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Envden_1\\envden.exe",
  ],
])
  test(`stable executable for ${executable}`, () => {
    expect(stableExecutable(executable!)).toBe(stable!);
  });
