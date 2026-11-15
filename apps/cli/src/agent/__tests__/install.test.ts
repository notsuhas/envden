import { test, expect } from "bun:test";
import { mkdtemp, rm, readlink, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installAgent } from "../install.ts";

const fixtureClock = () => 1800000000000;

test("agent install is idempotent and notice files use the shell adapter paths", async () => {
  const home = await mkdtemp(join(tmpdir(), "envden-agent-"));

  try {
    await installAgent(home, fixtureClock);
    await installAgent(home, fixtureClock);

    expect(await readlink(join(home, ".claude", "skills", "envden"))).toBe(
      join(home, ".agents", "skills", "envden"),
    );

    expect(await readFile(join(home, ".agents", "skills", "envden", "SKILL.md"), "utf8")).toContain(
      "own terminal",
    );
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("agent install refuses an existing real destination folder", async () => {
  const home = await mkdtemp(join(tmpdir(), "envden-agent-folder-"));

  try {
    const { mkdir } = await import("node:fs/promises");
    await mkdir(join(home, ".claude", "skills", "envden"), { recursive: true });

    await Promise.resolve(
      expect(installAgent(home, fixtureClock)).rejects.toThrow("existing folder or file"),
    );
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
