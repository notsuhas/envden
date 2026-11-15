import { markAppliedEntry } from "../local/applied.ts";
import { text } from "../../client/encoding.ts";
import { test, expect } from "bun:test";
import { join } from "node:path";
import { cp, readFile, mkdir } from "node:fs/promises";
import * as p from "@envden/core/protocol";
import { createFakeRepoAdapter } from "@envden/testing/repo";
import { fixture } from "../../admin/recovery/__tests__/fixture.ts";
import { atomicWrite } from "../../state/store/files.ts";
import { syncContext } from "../remote/context.ts";
import { sealUpload } from "../remote/seal.ts";
import { reconcileFile } from "../local/reconciliation/file.ts";
import { conflictRecords } from "../local/conflicts.ts";
import { saveBase } from "../local/reconciliation/history.ts";
import { basePath } from "../local/files.ts";

const fixtureClock = () => 1800000000000;

for (const detached of [true, false])
  test.if(process.platform !== "win32")(
    `pull after copying a template preserves detached bytes: ${detached}`,
    async () => {
      const f = await fixture();

      try {
        const checkout = {
          root: join(f.root, "repo"),
          gitDir: join(f.root, "repo", ".git"),
          repoId: "github.com/test/repo",
        };

        f.first.repo = createFakeRepoAdapter({
          caseInsensitive: async () => false,
          checkoutAt: async () => checkout,
          ensureIgnored: async () => {},
        });

        const context = await syncContext(f.first, {
          now: f.now,
          fetcher: f.fetcher,
          interactive: false,
          yes: true,
        });

        context.state.approved.push(checkout);
        const store = join(f.first.home, "store", "repo", ".env");
        const target = { root: checkout.root, path: ".env", store, mode: "link" as const };
        context.state.links.push(target);
        const old = new TextEncoder().encode("SECRET=old\n");
        const server = new TextEncoder().encode("SECRET=remote\n");
        await atomicWrite(store, old, fixtureClock);
        await saveBase(basePath(f.first.home, store), old, fixtureClock);

        await atomicWrite(
          join(checkout.root, ".env.example"),
          detached ? "SECRET=example\n" : old,
          fixtureClock,
        );

        await cp(join(checkout.root, ".env.example"), join(checkout.root, ".env"));

        const applied = await sealUpload(
          context,
          checkout.repoId,
          ".env",
          p.fileId(context.checkpoint.idKey, checkout.repoId, ".env"),
          undefined,
          old,
        );

        await markAppliedEntry(
          f.first.home,
          text(p.FileEntryCodec.write(applied)),
          undefined,
          fixtureClock,
        );

        const entry = await sealUpload(
          context,
          checkout.repoId,
          ".env",
          p.fileId(context.checkpoint.idKey, checkout.repoId, ".env"),
          applied,
          server,
        );

        const result = await reconcileFile(context, [target], store, entry, new Set());

        expect(result.conflicts).toBe(detached ? 1 : 0);
        expect(await readFile(store, "utf8")).toBe(detached ? "SECRET=old\n" : "SECRET=remote\n");

        expect(await readFile(join(checkout.root, ".env"), "utf8")).toBe(
          detached ? "SECRET=example\n" : "SECRET=remote\n",
        );

        expect(await conflictRecords(f.first.home)).toHaveLength(detached ? 1 : 0);
      } finally {
        await f.close();
      }
    },
  );

test.if(process.platform !== "win32")(
  "each placed file survives an interrupted pull in state",
  async () => {
    const { loadState } = await import("../../state/store/repository.ts");
    const f = await fixture();

    try {
      const checkout = {
        root: join(f.root, "checkout"),
        gitDir: join(f.root, "checkout", ".git"),
        repoId: "github.com/test/repo",
      };

      await mkdir(checkout.root, { recursive: true });
      let placements = 0;

      f.first.repo = createFakeRepoAdapter({
        caseInsensitive: async () => false,
        checkoutAt: async () => checkout,
        ensureIgnored: async () => {
          if (++placements === 2) throw new Error("interrupted pull");
        },
      });

      const context = await syncContext(f.first, { now: f.now, fetcher: f.fetcher, yes: true });
      context.state.approved.push(checkout);
      const server = new TextEncoder().encode("KEY=remote\n");

      for (const path of [".env", ".env.local"]) {
        const store = join(f.first.home, "store", "repo", path);

        const entry = await sealUpload(
          context,
          checkout.repoId,
          path,
          p.fileId(context.checkpoint.idKey, checkout.repoId, path),
          undefined,
          server,
        );

        const action = reconcileFile(
          context,
          [{ root: checkout.root, path, store, mode: "link" }],
          store,
          entry,
          new Set(),
        );

        if (path === ".env") await action;
        else await Promise.resolve(expect(action).rejects.toThrow("interrupted pull"));
      }

      expect((await loadState(f.first.home))?.links.map((link) => link.path)).toEqual([".env"]);
    } finally {
      await f.close();
    }
  },
);
