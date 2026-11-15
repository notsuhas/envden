import * as p from "@envden/core/protocol";
import type { TAdapters } from "../../adapters.ts";
import type { TFetch } from "../../client/fetch.ts";
import { withStateLock } from "../../state/lock/lock.ts";
import { loadState } from "../../state/store/repository.ts";
import { requireConfigured } from "../../state/configured.ts";
import { selectedRepos } from "../../sync/local/selection.ts";
import { checkoutBytes } from "../files/current.ts";
import { historyTargets, selectionDirectory, type IHistoryTarget } from "../files/select.ts";
import { matchingVersion } from "../versions/match.ts";
import { retainedVersions, type IRetainedVersion } from "../versions/retained.ts";
import { historySource, type THistorySource } from "../versions/source.ts";
import { versionChanges, versionKind } from "./changes.ts";

interface IHistoryOptions {
  cwd: string;
  file?: string;
  all?: boolean;
  now: () => number;
  fetcher: TFetch;
}

export function fileHistory(adapters: TAdapters, options: IHistoryOptions) {
  return withStateLock(adapters.home, async () => {
    const state = requireConfigured(await loadState(adapters.home), "Run setup or join first");

    const repos = await selectedRepos(adapters, state, {
      now: options.now,
      fetcher: options.fetcher,
      cwd: selectionDirectory(options),
      ...(options.all ? { all: true } : {}),
    });

    const groups = groupTargets(historyTargets(state, repos, options));
    const source = await historySource(adapters, options.now, options.fetcher);

    const ids = groups.map((group) => p.fileId(source.idKey, group[0]!.repoId, group[0]!.path));
    const walks = await retainedVersions(source, ids);
    const files = [];

    for (const [index, group] of groups.entries()) {
      const walk = walks.get(p.base32(ids[index]!))!;
      files.push(await fileRecord(adapters, source, group, walk.versions, walk.pruned));
    }

    return { files };
  });
}

async function fileRecord(
  adapters: TAdapters,
  source: THistorySource,
  group: IHistoryTarget[],
  versions: IRetainedVersion[],
  pruned: boolean,
) {
  const changes = versionChanges(versions, !pruned);
  const checkouts = [];

  for (const target of group) {
    const version = matchingVersion(versions, (await checkoutBytes(adapters, target)).bytes);
    checkouts.push({ root: target.root, ...(version === undefined ? {} : { version }) });
  }

  return {
    repoId: group[0]!.repoId,
    path: group[0]!.path,
    pruned,
    checkouts,
    versions: versions.map((version, index) => ({
      version: version.version,
      kind: versionKind(version.state),
      ...versionOrigin(source, version.header),
      changes: changes[index]!,
    })),
  };
}

function versionOrigin(source: THistorySource, header: IRetainedVersion["header"]) {
  if (!header) return {};
  const time = new Date(Number(header.body.createdAt)).toISOString();
  const device = source.history.state.devices.get(p.base32(header.body.signer));

  return device ? { time, device: device.name } : { time, removedDevice: true as const };
}

function groupTargets(targets: IHistoryTarget[]) {
  const groups = new Map<string, IHistoryTarget[]>();

  for (const target of targets) {
    const key = `${target.repoId}\0${target.path}`;
    groups.set(key, [...(groups.get(key) ?? []), target]);
  }

  return [...groups.values()];
}

export type THistoryResult = Awaited<ReturnType<typeof fileHistory>>;
