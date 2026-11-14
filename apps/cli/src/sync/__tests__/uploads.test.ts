import { storePath } from "../../store/path.ts";
import { test, expect } from "bun:test";
import { join } from "node:path";
import { fixture } from "../../admin/recovery/__tests__/fixture.ts";
import { atomicWrite } from "../../state/store/files.ts";
import { syncContext } from "../remote/context.ts";
import { uploadLink } from "../remote/upload.ts";
import type { IFiles } from "@envden/core/protocol";

test("two copies of one store upload one blob and retain both bases", async () => {
  const f = await fixture();

  try {
    let uploads = 0;

    const context = await syncContext(f.first, {
      now: f.now,
      yes: true,
      fetcher: async (input, init) => {
        const url = new URL(input instanceof Request ? input.url : String(input));
        if (url.pathname.startsWith("/v1/blobs/") && init?.method === "PUT") uploads++;

        return f.fetcher(input, init);
      },
    });

    const files: IFiles = { entries: [] };
    const changed = new Map<string, { base: string; bytes: Uint8Array | undefined }>();
    const seen = new Map<string, Uint8Array | undefined>();
    const store = join(f.first.home, "store", ".env");

    await atomicWrite(store, "KEY=changed\n");

    for (const name of ["one", "two"]) {
      const root = join(f.root, name);
      context.state.approved.push({ root, gitDir: join(root, ".git"), repoId: "repo" });
      await atomicWrite(join(root, ".env"), "KEY=changed\n");

      await uploadLink(
        context,
        new Set(["repo"]),
        { root, path: ".env", store, mode: "copy" },
        files,
        changed,
        seen,
      );
    }

    expect(uploads).toBe(1);
    expect(files.entries).toHaveLength(1);
    expect(changed.size).toBe(2);
  } finally {
    await f.close();
  }
});

test("an already applied entry reuses its base without downloading its blob", async () => {
  const { mkdir, rm } = await import("node:fs/promises");
  const { createFakeRepoAdapter } = await import("@envden/testing/repo");
  const { sealUpload } = await import("../remote/seal.ts");
  const { reconcile } = await import("../local/reconcile.ts");
  const p = await import("@envden/core/protocol");
  const { text } = await import("../../client/encoding.ts");
  const f = await fixture();

  try {
    let downloads = 0;

    const context = await syncContext(f.first, {
      now: f.now,
      yes: true,
      fetcher: async (input, init) => {
        const url = new URL(input instanceof Request ? input.url : String(input));
        if (url.pathname.startsWith("/v1/blobs/") && init?.method === "GET") downloads++;

        return f.fetcher(input, init);
      },
    });

    const root = join(f.root, "checkout");
    await mkdir(root);
    const checkout = { root, gitDir: join(root, ".git"), repoId: "repo" };

    f.first.repo = createFakeRepoAdapter({
      caseInsensitive: async () => false,
      checkoutAt: async () => checkout,
      ensureIgnored: async () => {},
    });

    context.state.approved.push(checkout);
    const store = storePath(f.first.home, "repo", ".env");
    context.state.links.push({ root, path: ".env", store, mode: "copy" });

    const entry = await sealUpload(
      context,
      "repo",
      ".env",
      p.fileId(context.checkpoint.idKey, "repo", ".env"),
      undefined,
      new TextEncoder().encode("KEY=remote\n"),
    );

    context.checkpoint.files = { entries: [entry] };
    await rm(join(f.first.home, "state", "blobs", text(entry.blobHash)));
    await reconcile(context, new Set(["repo"]), new Set());
    expect(downloads).toBe(1);
    await rm(join(f.first.home, "state", "blobs", text(entry.blobHash)), { force: true });
    await reconcile(context, new Set(["repo"]), new Set());
    expect(downloads).toBe(1);
  } finally {
    await f.close();
  }
});

test("push skips an oversized file and reports only its path", async () => {
  const f = await fixture();

  try {
    const reports: string[] = [];

    const context = await syncContext(f.first, {
      now: f.now,
      yes: true,
      fetcher: f.fetcher,
      report: (message) => reports.push(message),
    });

    const root = join(f.root, "oversized");
    const store = join(f.first.home, "store", "oversized");
    const bytes = new Uint8Array(1048577);
    await atomicWrite(store, bytes);
    await atomicWrite(join(root, ".env.large"), bytes);
    context.state.approved.push({ root, gitDir: join(root, ".git"), repoId: "repo" });
    const files: IFiles = { entries: [] };

    await uploadLink(
      context,
      new Set(["repo"]),
      { root, path: ".env.large", store, mode: "copy" },
      files,
      new Map(),
      new Map(),
    );

    expect(files.entries).toHaveLength(0);
    expect(reports).toEqual(["Skipped oversized env file: .env.large exceeds 1 MiB"]);
  } finally {
    await f.close();
  }
});
