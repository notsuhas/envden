import { test, expect } from "bun:test";
import { stableExecutable } from "../self/paths.ts";

for (const [executable, stable] of [
  ["/opt/homebrew/Cellar/envden/0.2.0/bin/envden", "/opt/homebrew/bin/envden"],
  [
    "/home/linuxbrew/.linuxbrew/Cellar/envden/0.2.0/bin/envden",
    "/home/linuxbrew/.linuxbrew/bin/envden",
  ],
  ["/opt/homebrew/opt/envden/bin/envden", "/opt/homebrew/bin/envden"],
  ["/home/me/.envden/bin/envden", "/home/me/.envden/bin/envden"],
])
  test(`stable executable for ${executable}`, () => {
    expect(stableExecutable(executable!)).toBe(stable!);
  });
