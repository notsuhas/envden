import { test, expect } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { emptyState } from "../../state/model.ts";
import { pruneMissingCheckouts } from "../prune.ts";

for (const unavailable of [true, false])
  test(`prune preserves unavailable parent volumes: ${unavailable}`, async () => {
    const home = await mkdtemp(join(tmpdir(), "envden-prune-"));

    try {
      const state = emptyState("test");
      const root = unavailable ? join(home, "unmounted", "repo") : join(home, "removed");
      state.approved.push({ root, repoId: "host/repo", gitDir: join(root, ".git") });
      state.links.push({ root, path: ".env", store: join(home, "store"), mode: "copy" });
      await pruneMissingCheckouts(home, state, () => {});
      expect(state.approved).toHaveLength(unavailable ? 1 : 0);
      expect(state.links).toHaveLength(unavailable ? 1 : 0);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
