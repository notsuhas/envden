import { storePath } from "../../store/path.ts";
import { expect, test } from "bun:test";
import { join } from "node:path";
import * as p from "@envden/core/protocol";
import { syncFixture } from "./flows.ts";
import { syncContext } from "../remote/context.ts";
import { sealUpload } from "../remote/seal.ts";
import { reconcile } from "../local/reconcile.ts";
import { EnvdenError } from "@envden/core/errors";

test("receiver filters unsafe env names and continues after placement failures", async () => {
  const f = await syncFixture();
  const reports: string[] = [];

  try {
    const context = await syncContext(f.second, {
      ...f.opts,
      report: (message) => reports.push(message),
    });

    const repoId = f.checkout.repoId;

    for (const path of [
      ".env.bad",
      ".env.good",
      ".env.COLLISION",
      ".env.collision",
      ".envrc",
      ".npmrc",
      "node_modules/.env",
    ]) {
      context.checkpoint.files.entries.push(
        await sealUpload(
          context,
          repoId,
          path,
          p.fileId(context.checkpoint.idKey, repoId, path),
          undefined,
          new TextEncoder().encode("KEY=test\n"),
        ),
      );
    }

    f.second.repo.ensureIgnored = async (_, path) => {
      if (path === ".env.bad") throw new EnvdenError("CONFLICT", "Refusing a tracked env file");
    };

    f.second.repo.caseInsensitive = async () => true;

    const result = await reconcile(context, new Set([repoId]), new Set());
    expect(result.conflicts).toBe(2);
    expect(result.failedStores.has(storePath(f.second.home, repoId, ".env.collision"))).toBe(true);
    expect(result.failedStores.has(storePath(f.second.home, repoId, ".env.bad"))).toBe(true);
    expect(await Bun.file(join(f.checkoutB.root, ".env.good")).exists()).toBe(true);

    for (const path of [".envrc", ".npmrc", "node_modules/.env"]) {
      expect(await Bun.file(join(f.checkoutB.root, path)).exists()).toBe(false);
      expect(reports.some((message) => message.includes(path))).toBe(true);
    }
  } finally {
    await f.cleanup();
  }
});
