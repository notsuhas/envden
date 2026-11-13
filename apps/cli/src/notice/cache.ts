import { readRemoteNotice } from "./remote.ts";
import { join } from "node:path";
import type { ILocalState } from "../state/model.ts";
import { atomicWrite, optionalRead } from "../state/files.ts";
import { basePath, readBytes, same } from "../sync/local/files.ts";

export async function noticeStatus(home: string, state: ILocalState) {
  const repos = new Set<string>();

  for (const link of state.links) {
    if (link.localOnly) continue;

    const base = await readBytes(
      basePath(home, link.store, link.mode === "copy" ? link.root : undefined),
    );

    const local = await readBytes(link.mode === "link" ? link.store : join(link.root, link.path));

    if (!same(base, local)) {
      const checkout = state.approved.find((item) => item.root === link.root);
      if (checkout) repos.add(state.aliases[checkout.repoId] ?? checkout.repoId);
    }
  }

  return [...repos].map((repoId) => ({ repoId, status: "local changes" }));
}

export async function refreshNotice(home: string, state: ILocalState): Promise<void> {
  const roots = state.approved.map((item) => item.root).filter((root) => !/[\r\n]/.test(root));
  await atomicWrite(join(home, "state", "approved-checkouts"), roots.join("\n") + "\n");
  const local = await noticeStatus(home, state);
  const remote = await readRemoteNotice(home);
  const repos = [...new Set([...local.map((item) => item.repoId), ...(remote?.repos ?? [])])];

  await atomicWrite(
    join(home, "state", "notice"),
    repos.map((repoId) => `envden: ${repoId} out of sync`).join("\n") + (repos.length ? "\n" : ""),
  );
}

export async function cachedNotice(home: string): Promise<string> {
  return (await optionalRead(join(home, "state", "notice"))) ?? "";
}
