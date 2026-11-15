import { join } from "node:path";
import { checkoutRepo } from "../links/checkout/repo.ts";
import type { TAdapters } from "../adapters.ts";
import { loadState } from "../state/store/repository.ts";
import type { ILocalState } from "../state/model.ts";
import { diff } from "../sync/diff.ts";
import { heldBackFiles } from "../sync/local/lineage/held-back.ts";
import { deriveFileState, type TFileState } from "./file-state.ts";
import { localStatus } from "./local.ts";
import { remoteFiles } from "./remote.ts";

type TLink = Awaited<ReturnType<typeof localStatus>>["links"][number];

interface IRemoteFile {
  repoId: string;
  path: string;
}

interface IStatusFile {
  root: string;
  path: string;
  repoId?: string;
  state: TFileState;
  reason?: string;
  keys?: { added: string[]; removed: string[]; changed: string[] };
}

interface IFacts {
  state: ILocalState;
  changes: Awaited<ReturnType<typeof diff>>;
  heldBack: Awaited<ReturnType<typeof heldBackFiles>>;
  remote: IRemoteFile[];
}

export async function statusReport(adapters: TAdapters) {
  const local = await localStatus(adapters);
  const state = await loadState(adapters.home);

  if (!("vaultId" in local) || !state) return { configured: false as const, update: local.update };

  const changes = await diff(adapters, { now: adapters.now, fetcher: adapters.fetcher, all: true });
  const heldBack = await heldBackFiles(adapters);
  const remote = local.server === "reachable" ? await remoteFiles(adapters) : undefined;
  const facts = { state, changes, heldBack, remote: remote ?? [] };

  return {
    configured: true as const,
    vaultId: local.vaultId,
    server: local.server,
    ...(local.serverReason ? { serverReason: local.serverReason } : {}),
    serverChecked: remote !== undefined,
    files: [...local.links.map((link) => linkFile(link, facts)), ...incomingFiles(facts)],
    update: local.update,
  };
}

export type TStatusReport = Awaited<ReturnType<typeof statusReport>>;

function linkFile(link: TLink, facts: IFacts): IStatusFile {
  const repoId = checkoutRepo(facts.state, link.root);
  const change = facts.changes.find((item) => item.root === link.root && item.path === link.path);
  const held = facts.heldBack.find((item) => item.path === join(link.root, link.path));

  const state = deriveFileState({
    localOnly: link.localOnly,
    conflict: link.conflict,
    placement: link.status,
    heldBack: !!held,
    changed: !!change?.differs,
    remote: facts.remote.some((file) => file.repoId === repoId && file.path === link.path),
  });

  return {
    root: link.root,
    path: link.path,
    ...(repoId ? { repoId } : {}),
    state,
    ...(state === "held-back" && held ? { reason: held.reason } : {}),
    ...(change?.differs && change.kind === "diff"
      ? { keys: { added: change.added, removed: change.removed, changed: change.changed } }
      : {}),
  };
}

function incomingFiles(facts: IFacts): IStatusFile[] {
  return facts.state.approved.flatMap((checkout) => {
    const repoId = facts.state.aliases[checkout.repoId] ?? checkout.repoId;

    return facts.remote
      .filter(
        (file) =>
          file.repoId === repoId &&
          !facts.state.links.some((link) => link.root === checkout.root && link.path === file.path),
      )
      .map((file) => ({ root: checkout.root, path: file.path, repoId, state: "remote" }));
  });
}
