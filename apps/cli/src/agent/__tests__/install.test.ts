import { test, expect } from "bun:test";
import { mkdtemp, rm, readlink, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installAgent } from "../install.ts";

test("agent install is idempotent and notice files use the shell adapter paths", async () => {
  const home = await mkdtemp(join(tmpdir(), "envden-agent-"));

  try {
    await installAgent(home);
    await installAgent(home);

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
    expect(installAgent(home)).rejects.toThrow("existing folder or file");
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
