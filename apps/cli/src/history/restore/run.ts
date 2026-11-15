import * as p from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";
import { join } from "node:path";
import type { TAdapters } from "../../adapters.ts";
import type { TFetch } from "../../client/fetch.ts";
import { readConfig } from "../../settings/config.ts";
import { withStateLock } from "../../state/lock/lock.ts";
import { loadState } from "../../state/store/repository.ts";
import { requireConfigured } from "../../state/configured.ts";
import { backup, conflictRecords } from "../../sync/local/conflicts.ts";
import { same, writeBytes } from "../../sync/local/files.ts";
import { selectedRepos } from "../../sync/local/selection.ts";
import { checkoutBytes } from "../files/current.ts";
import { historyTargets, selectionDirectory, type IHistoryTarget } from "../files/select.ts";
import { versionChanges } from "../list/changes.ts";
import { changesText } from "../list/render.ts";
import { retainedVersions } from "../versions/retained.ts";
import { historySource } from "../versions/source.ts";
import { restoreGate } from "./gate.ts";
import { restoreRefusal } from "./refusal.ts";

interface IRestoreOptions {
  cwd: string;
  file: string;
  version: number;
  yes: boolean;
  interactive: boolean;
  confirm: (message: string) => Promise<boolean>;
  now: () => number;
  fetcher: TFetch;
}

export async function restoreVersion(adapters: TAdapters, options: IRestoreOptions) {
  const gate = restoreGate({
    yes: options.yes,
    interactive: options.interactive,
    agentMerge: (await readConfig(adapters.home))["agent-merge"],
  });

  if (gate.kind === "refused") throw new EnvdenError("INVALID_INPUT", gate.message);

  return withStateLock(adapters.home, async () => {
    const { target, link, bytes } = await restorableTarget(adapters, options);
    const content = await versionContent(adapters, options, target);
    const path = join(target.root, target.path);
    const changes = versionChanges([{ content }, { content: bytes }], true)[0]!;
    const summary = { path, version: options.version, changes };

    if (same(bytes, content)) return { kind: "unchanged" as const, ...summary };

    const prompt = `Restore ${path} to version ${options.version}? ${changesText(changes)}`;

    if (gate.kind === "confirm" && !(await options.confirm(prompt)))
      return { kind: "cancelled" as const, ...summary };

    const destination = link.mode === "link" ? link.store : path;
    const saved = await backup(adapters.home, destination, options.now());
    await writeBytes(destination, content, options.now);

    return { kind: "restored" as const, ...summary, ...(saved ? { backup: saved } : {}) };
  });
}

async function restorableTarget(adapters: TAdapters, options: IRestoreOptions) {
  const state = requireConfigured(await loadState(adapters.home));

  const repos = await selectedRepos(adapters, state, {
    now: options.now,
    fetcher: options.fetcher,
    cwd: selectionDirectory(options),
  });

  const target = historyTargets(state, repos, options)[0]!;
  const current = target.link ? await checkoutBytes(adapters, target) : undefined;
  const records = await conflictRecords(adapters.home);

  const refusal = restoreRefusal({
    managed: !!target.link,
    localOnly: !!target.link?.localOnly,
    detached: !!current?.detached,
    conflicted: records.some((record) => record.store === target.link?.store),
  });

  if (refusal) throw new EnvdenError(refusal.code, refusal.message);

  return { target, link: target.link!, bytes: current?.bytes };
}

async function versionContent(
  adapters: TAdapters,
  options: IRestoreOptions,
  target: IHistoryTarget,
) {
  const source = await historySource(adapters, options.now, options.fetcher);
  const id = p.fileId(source.idKey, target.repoId, target.path);
  const walk = (await retainedVersions(source, [id])).get(p.base32(id))!;
  const chosen = walk.versions.find((item) => item.version === options.version);

  if (!chosen) throw new EnvdenError("NOT_FOUND", "Version is not retained on the server");

  if (chosen.content === undefined)
    throw new EnvdenError(
      "INVALID_INPUT",
      "That version deleted the file; choose one with content",
    );

  return chosen.content;
}

export type TRestoreResult = Awaited<ReturnType<typeof restoreVersion>>;
