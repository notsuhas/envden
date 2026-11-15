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

export async function remoteNotice(adapters: TAdapters, options: ISyncOptions) {
  const context = await syncContext(adapters, options);
  await acceptHead(context, undefined, true);
  const result = await pendingRepos(context);

  await withStateLock(adapters.home, async () => {
    await writeRemoteNotice(adapters.home, result, adapters.now);

    await addPendingJoins(
      adapters.home,
      context.entries.map((entry) => text(p.signedCodec(p.EntryCodec).write(entry))),
      context.identity.record.id,
      adapters.now,
    );
  });

  return result;
}

export async function settleRemoteNotice(context: TSyncContext) {
  const result = await pendingRepos(context);

  await withStateLock(context.adapters.home, () =>
    writeRemoteNotice(context.adapters.home, result, context.options.now),
  );
}

async function pendingRepos(context: TSyncContext) {
  const applied = await appliedFiles(context.adapters.home);
  const rules = (await readConfig(context.adapters.home))["env-files"];

  const approved = new Set(
    context.state.approved.map((item) => context.state.aliases[item.repoId] ?? item.repoId),
  );

  const repos = new Set<string>();

  for (const entry of readableEntries(context)) {
    if (applied[p.base32(entry.fileId)] === text(p.FileEntryCodec.write(entry))) continue;
    const name = entryName(context, entry);

    if (
      approved.has(name.repoId) &&
      acceptsEnvPath(name.path, rules) &&
      receivesFile(context.state, name)
    )
      repos.add(name.repoId);
  }

  return { checkedAt: context.options.now(), repos: [...repos] };
}

function writeRemoteNotice(
  home: string,
  notice: { checkedAt: number; repos: string[] },
  now: () => number,
) {
  return atomicWrite(join(home, "state", "remote-notice.json"), JSON.stringify(notice), now);
}

export async function readRemoteNotice(
  home: string,
): Promise<{ checkedAt: number; repos: string[] } | undefined> {
  const value = await optionalRead(join(home, "state", "remote-notice.json"));

  try {
    const parsed: unknown = value ? JSON.parse(value) : undefined;

    if (
      parsed &&
      typeof parsed === "object" &&
      "checkedAt" in parsed &&
      typeof parsed.checkedAt === "number" &&
      "repos" in parsed &&
      Array.isArray(parsed.repos) &&
      parsed.repos.every((repo): repo is string => typeof repo === "string")
    )
      return { checkedAt: parsed.checkedAt, repos: parsed.repos };
  } catch {
    return undefined;
  }

  return undefined;
}
