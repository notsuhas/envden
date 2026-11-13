import { test, expect } from "bun:test";
import { mkdtemp, rm, readlink, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installAgent } from "../install.ts";
import { emptyState } from "../../state/model.ts";
import { refreshNotice } from "../../notice/cache.ts";

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

    const state = emptyState("laptop");
    state.approved.push({ root: "/code/repo", gitDir: "/code/repo/.git", repoId: "host/repo" });
    await refreshNotice(home, state);
    expect(await readFile(join(home, "state", "approved-checkouts"), "utf8")).toBe("/code/repo\n");
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
