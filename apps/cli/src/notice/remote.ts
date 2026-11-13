import { withStateLock } from "../state/lock/lock.ts";
import { appliedFiles } from "../sync/local/applied.ts";
import { text } from "../client/encoding.ts";
import { join } from "node:path";
import * as p from "@envden/core/protocol";
import type { TAdapters } from "../adapters.ts";
import type { ISyncOptions } from "../sync/model.ts";
import { syncContext } from "../sync/remote/context.ts";
import { acceptHead } from "../sync/remote/accept.ts";
import { entryName } from "../sync/remote/content.ts";
import { atomicWrite, optionalRead } from "../state/store/files.ts";

export async function remoteNotice(adapters: TAdapters, options: ISyncOptions) {
  const context = await syncContext(adapters, options);
  const applied = await appliedFiles(adapters.home);
  await acceptHead(context, undefined, true);

  const approved = new Set(
    context.state.approved.map((item) => context.state.aliases[item.repoId] ?? item.repoId),
  );

  const repos = new Set<string>();

  for (const entry of context.checkpoint.files.entries) {
    if (applied[p.base32(entry.fileId)] === text(p.FileEntryCodec.write(entry))) continue;
    const name = entryName(context, entry);
    if (approved.has(name.repoId)) repos.add(name.repoId);
  }

  const result = { checkedAt: options.now(), repos: [...repos] };

  await withStateLock(adapters.home, async () => {
    await atomicWrite(join(adapters.home, "state", "remote-notice.json"), JSON.stringify(result));

    await atomicWrite(
      join(adapters.home, "state", "pending-recovery.json"),
      JSON.stringify({
        entries: context.entries.map((entry) => text(p.signedCodec(p.EntryCodec).write(entry))),
        ownId: text(context.identity.record.id),
      }),
    );
  });

  return result;
}

export async function readRemoteNotice(
  home: string,
): Promise<{ checkedAt: number; repos: string[] } | undefined> {
  const value = await optionalRead(join(home, "state", "remote-notice.json"));

  return value ? JSON.parse(value) : undefined;
}
