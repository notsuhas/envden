import { expect, test, spyOn } from "bun:test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveTrustedExecutable, setUntrustedRoots } from "@envden/core/process";
import { createProgram } from "../../program.ts";
import { emptyState } from "../model.ts";
import { saveState } from "../store/repository.ts";

const fixtureClock = () => 1800000000000;

test("CLI startup registers approved checkouts before commands run", async () => {
  const home = await mkdtemp(join(tmpdir(), "envden-startup-"));
  const before = process.env.ENVDEN_HOME;
  const output = spyOn(console, "log").mockImplementation(() => {});
  const checkout = join(home, "checkout");
  await mkdir(checkout);
  const tool = join(checkout, "tool");
  await writeFile(tool, "#!/bin/sh\nexit 0", { mode: 0o755 });
  const state = emptyState("test");
  state.approved.push({ root: checkout, gitDir: join(home, "external-git"), repoId: "test" });
  await saveState(home, state, fixtureClock);

  try {
    expect(resolveTrustedExecutable(tool)).toBeDefined();
    process.env.ENVDEN_HOME = home;
    await createProgram(fixtureClock).parseAsync(["node", "envden", "version"]);
    expect(() => resolveTrustedExecutable(tool)).toThrow("Trusted executable unavailable");
  } finally {
    setUntrustedRoots([]);

    if (before === undefined) delete process.env.ENVDEN_HOME;
    else process.env.ENVDEN_HOME = before;

    output.mockRestore();
    await rm(home, { recursive: true, force: true });
  }
});
