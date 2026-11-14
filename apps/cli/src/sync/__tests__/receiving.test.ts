import { storePath } from "../../store/path.ts";
import { expect, test } from "bun:test";
import { join } from "node:path";
import * as p from "@envden/core/protocol";
import { syncFixture } from "./flows.ts";
import { syncContext } from "../remote/context.ts";
import { sealUpload } from "../remote/seal.ts";
import { reconcile } from "../local/reconcile.ts";
import { rm } from "node:fs/promises";
import { execTrustedSync } from "@envden/core/process";
import { createGitRepoAdapter } from "@envden/adapter-repo-git";
import { atomicWrite } from "../../state/store/files.ts";

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

    execTrustedSync("git", ["init", "-q", f.checkoutB.root]);
    await atomicWrite(join(f.checkoutB.root, ".env.bad"), "KEY=tracked\n");
    execTrustedSync("git", ["-C", f.checkoutB.root, "add", ".env.bad"]);
    await rm(join(f.checkoutB.root, ".env.bad"));
    const repo = createGitRepoAdapter();

    f.second.repo.ensureIgnored = (checkout, path) =>
      path === ".env.bad" ? repo.ensureIgnored(checkout, path) : Promise.resolve();

    f.second.repo.caseInsensitive = async () => true;

    const result = await reconcile(context, new Set([repoId]), new Set());
    expect(result.conflicts).toBe(2);
    expect(reports.some((message) => message.includes("(INVALID_INPUT): .env.bad"))).toBe(true);
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

test("invalid first-run answers report a conflict and continue placing other files", async () => {
  const { firstSync, push } = await import("../engine.ts");
  const { EnvdenError } = await import("@envden/core/errors");
  const { loadState, saveState } = await import("../../state/store/repository.ts");
  const { linkCheckout } = await import("../../links/place.ts");
  const f = await syncFixture();

  try {
    await atomicWrite(join(f.checkout.root, ".env.good"), "GOOD=remote\n");
    f.first.repo.envFiles = async () => [".env.good"];
    const state = (await loadState(f.first.home))!;
    await linkCheckout(f.first, state, f.checkout, async () => true);
    await saveState(f.first.home, state);
    await push(f.first, f.opts);
    await atomicWrite(join(f.checkoutB.root, ".env"), "TOKEN=mine\n");

    const result = await firstSync(f.second, { ...f.opts, interactive: true }, async () => {
      throw new EnvdenError("INVALID_INPUT", "Unknown first-run choice");
    });

    expect(result.conflicts).toBe(1);
    expect(await Bun.file(join(f.checkoutB.root, ".env")).text()).toBe("TOKEN=mine\n");
    expect(await Bun.file(join(f.checkoutB.root, ".env.good")).text()).toBe("GOOD=remote\n");
  } finally {
    await f.cleanup();
  }
});
