import { expect, test } from "bun:test";
import * as p from "@envden/core/protocol";
import { createFakeRepoAdapter } from "@envden/testing/repo";
import { syncFixture } from "../../../__tests__/flows.ts";
import { syncContext } from "../../../remote/context.ts";
import { collisionEntries } from "../entries.ts";
import { entryName } from "../../../remote/content.ts";

test("case-insensitive placement rejects the same path in either encrypted entry order", async () => {
  const fixture = await syncFixture();

  try {
    const context = await syncContext(fixture.second, fixture.opts);
    const original = context.checkpoint.files.entries[0]!;
    const paths = ["Dir/.env", "dir/.env.local"];

    const entries = paths.map((path) => {
      const entry = {
        ...original,
        fileId: p.fileId(context.checkpoint.idKey, fixture.checkoutB.repoId, path),
      };

      entry.name = p.sealFileName(
        { repoId: fixture.checkoutB.repoId, path },
        context.keys.get(entry.epoch)!,
        { ...entry, vaultId: context.vaultId },
      );

      return entry;
    });

    context.adapters.repo = createFakeRepoAdapter({ caseInsensitive: async () => true });

    for (const ordered of [entries, [...entries].reverse()]) {
      context.checkpoint.files.entries = ordered;
      const collisions = await collisionEntries(context, new Set([fixture.checkoutB.repoId]));

      expect([...collisions].map((entry) => entryName(context, entry).path)).toEqual([
        "dir/.env.local",
      ]);
    }
  } finally {
    await fixture.cleanup();
  }
});
