import { z } from "zod";
import { acceptsEnvPath } from "@envden/core/adapters";
import { readConfig } from "../settings/config.ts";
import { receivesFile } from "../sync/local/receiving.ts";
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
import { entryName, readableEntries } from "../sync/remote/content.ts";
import { atomicWrite, optionalRead } from "../state/store/files.ts";
import { joinRequests } from "../approval/approver.ts";
import { changedFile, changedFileSchema, type TChangedFile } from "./changes/details.ts";

const remoteNoticeSchema = z.object({
  checkedAt: z.number(),
  repos: z.array(z.string()),
  files: z.array(changedFileSchema),
  waiting: z.number().int().nonnegative(),
});

type TRemoteNotice = z.infer<typeof remoteNoticeSchema>;

export async function remoteNotice(adapters: TAdapters, options: ISyncOptions) {
  const context = await syncContext(adapters, options);
  const before = context.checkpoint;
  const { fileLists } = await acceptHead(context, undefined, true);
  fileLists.set(text(before.header.body.filesHash), before.files);
  const result = await pendingRepos(context, fileLists);
  const waiting = (await joinRequests(context.client)).length;

  await withStateLock(adapters.home, async () => {
    await writeRemoteNotice(adapters.home, { ...result, waiting }, adapters.now);

    await addPendingJoins(
      adapters.home,
      context.entries.map((entry) => text(p.signedCodec(p.EntryCodec).write(entry))),
      context.identity.record.id,
      adapters.now,
    );
  });

  return { ...result, waiting };
}

export async function settleRemoteNotice(context: TSyncContext) {
  const result = await pendingRepos(context);
  const waiting = (await readRemoteNotice(context.adapters.home))?.waiting ?? 0;

  await withStateLock(context.adapters.home, () =>
    writeRemoteNotice(context.adapters.home, { ...result, waiting }, context.options.now),
  );
}

async function pendingRepos(context: TSyncContext, known?: ReadonlyMap<string, p.IFiles>) {
  const applied = await appliedFiles(context.adapters.home);
  const rules = (await readConfig(context.adapters.home))["env-files"];

  const approved = new Set(
    context.state.approved.map((item) => context.state.aliases[item.repoId] ?? item.repoId),
  );

  const files: TChangedFile[] = [];

  for (const entry of readableEntries(context)) {
    const previous = applied[p.base32(entry.fileId)];
    if (previous === text(p.FileEntryCodec.write(entry))) continue;
    const name = entryName(context, entry);

    if (
      approved.has(name.repoId) &&
      acceptsEnvPath(name.path, rules) &&
      receivesFile(context.state, name)
    )
      files.push(await changedFile(context, entry, name, previous, known));
  }

  const repos = [...new Set(files.map((file) => file.repoId))];

  return { checkedAt: context.options.now(), repos, files };
}

function writeRemoteNotice(home: string, notice: TRemoteNotice, now: () => number) {
  return atomicWrite(join(home, "state", "remote-notice.json"), JSON.stringify(notice), now);
}

export async function readRemoteNotice(home: string): Promise<TRemoteNotice | undefined> {
  const value = await optionalRead(join(home, "state", "remote-notice.json"));

  try {
    return remoteNoticeSchema.safeParse(value ? JSON.parse(value) : undefined).data;
  } catch {
    return undefined;
  }
}
