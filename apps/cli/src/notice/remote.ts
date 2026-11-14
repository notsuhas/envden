import { addPendingJoins } from "./pending.ts";
import { withStateLock } from "../state/lock/lock.ts";
import { appliedFiles } from "../sync/local/applied.ts";
import { text } from "../client/encoding.ts";
import { join } from "node:path";
import * as p from "@envden/core/protocol";
import type { TAdapters } from "../adapters.ts";
import type { ISyncOptions } from "../sync/model.ts";
import { syncContext, type TSyncContext } from "../sync/remote/context.ts";
import { acceptHead } from "../sync/remote/accept.ts";
import { entryName } from "../sync/remote/content.ts";
import { atomicWrite, optionalRead } from "../state/store/files.ts";

export async function remoteNotice(adapters: TAdapters, options: ISyncOptions) {
  const context = await syncContext(adapters, options);
  await acceptHead(context, undefined, true);
  const result = await pendingRepos(context);

  await withStateLock(adapters.home, async () => {
    await writeRemoteNotice(adapters.home, result);

    await addPendingJoins(
      adapters.home,
      context.entries.map((entry) => text(p.signedCodec(p.EntryCodec).write(entry))),
      context.identity.record.id,
    );
  });

  return result;
}

export async function settleRemoteNotice(context: TSyncContext) {
  const result = await pendingRepos(context);

  await withStateLock(context.adapters.home, () =>
    writeRemoteNotice(context.adapters.home, result),
  );
}

async function pendingRepos(context: TSyncContext) {
  const applied = await appliedFiles(context.adapters.home);

  const approved = new Set(
    context.state.approved.map((item) => context.state.aliases[item.repoId] ?? item.repoId),
  );

  const repos = new Set<string>();

  for (const entry of context.checkpoint.files.entries) {
    if (applied[p.base32(entry.fileId)] === text(p.FileEntryCodec.write(entry))) continue;
    const name = entryName(context, entry);
    if (approved.has(name.repoId)) repos.add(name.repoId);
  }

  return { checkedAt: context.options.now(), repos: [...repos] };
}

function writeRemoteNotice(home: string, notice: { checkedAt: number; repos: string[] }) {
  return atomicWrite(join(home, "state", "remote-notice.json"), JSON.stringify(notice));
}

export async function readRemoteNotice(
  home: string,
): Promise<{ checkedAt: number; repos: string[] } | undefined> {
  const value = await optionalRead(join(home, "state", "remote-notice.json"));

  return value ? JSON.parse(value) : undefined;
}
