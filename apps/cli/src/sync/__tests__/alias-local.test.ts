import { test, expect } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createMemoryKeychainAdapter } from "@envden/testing/keychain";
import { createAdapters } from "../../adapters.ts";
import { emptyState } from "../../state/model.ts";

const fixtureClock = () => 1800000000000;

test("alias refuses existing placed files before changing their identity", async () => {
  const { aliasUnlinkedRepo } = await import("../alias.ts");
  const { saveState, loadState } = await import("../../state/store/repository.ts");
  const home = await mkdtemp(join(tmpdir(), "envden-alias-"));

  try {
    const state = emptyState("test");
    state.approved.push({ root: home, gitDir: join(home, ".git"), repoId: "source" });
    state.links.push({ root: home, path: ".env", store: join(home, "store"), mode: "copy" });
    await saveState(home, state, fixtureClock);

    await Promise.resolve(
      expect(
        aliasUnlinkedRepo(
          createAdapters(
            { home, userHome: home, keychain: createMemoryKeychainAdapter([]) },
            fixtureClock,
          ),
          "source",
          "target",
        ),
      ).rejects.toMatchObject({ code: "CONFLICT" }),
    );

    expect((await loadState(home))?.aliases).toEqual({});
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
