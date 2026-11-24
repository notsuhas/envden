import { join } from "node:path";
import { checkoutRepo } from "../../links/checkout/repo.ts";
import type { TAdapters } from "../../adapters.ts";
import { checkoutApproval } from "../../links/approval.ts";
import { readRemoteNotice } from "../../notice/remote.ts";
import { loadState } from "../../state/store/repository.ts";
import type { ILocalState } from "../../state/model.ts";
import { localStatus } from "../../status/local.ts";
import { diff } from "../../sync/diff.ts";
import { heldBackFiles } from "../../sync/local/lineage/held-back.ts";
import { conflictViews } from "./conflicts.ts";
import { fileStatus, pendingCount } from "./file-status.ts";
import { keyChanges } from "./key-changes.ts";
import type { IConflictView, IFileView, TApproval, TDashboardStatus } from "./model.ts";
import { groupRepos } from "./repos.ts";

type TLink = Awaited<ReturnType<typeof localStatus>>["links"][number];

interface IFileFacts {
  diffs: Awaited<ReturnType<typeof diff>>;
  heldBack: Awaited<ReturnType<typeof heldBackFiles>>;
  conflicts: IConflictView[];
  remote: Set<string>;
}

export async function dashboardStatus(
  adapters: TAdapters,
  now: () => number,
): Promise<TDashboardStatus> {
  const before = await loadState(adapters.home);
  if (!before?.server || !before.vaultId) return { kind: "not-configured" };

  const diffs = await diff(adapters, { now, fetcher: adapters.fetcher, all: true });
  const local = await localStatus(adapters);
  const state = await loadState(adapters.home);

  if (!("vaultId" in local) || !state?.server || !state.vaultId) return { kind: "not-configured" };

  const heldBack = await heldBackFiles(adapters);
  const remote = new Set((await readRemoteNotice(adapters.home))?.repos ?? []);
  const approvals = await checkoutApprovals(adapters, state);
  const conflicts = await conflictViews(adapters.home);
  const checkedAt = now();

  const facts = { diffs, heldBack, conflicts, remote };

  const rows = local.links.map((link) => {
    const repoId = checkoutRepo(state, link.root);

    return {
      repoId: repoId ?? "unapproved",
      root: link.root,
      approval: approvals.get(link.root) ?? "needs-approval",
      file: fileView(link, repoId, facts),
    };
  });

  return {
    kind: "configured",
    overview: {
      vaultId: state.vaultId.slice(0, 8),
      server: { address: state.server.address, reachability: local.server },
      deviceName: state.deviceName,
      checkedAt,
      pending: pendingCount(rows.map((row) => row.file.status)),
    },
    repos: groupRepos(rows),
    conflicts,
  };
}

function fileView(link: TLink, repoId: string | undefined, facts: IFileFacts): IFileView {
  const changes = facts.diffs.find((item) => item.root === link.root && item.path === link.path);
  const held = facts.heldBack.find((item) => item.path === join(link.root, link.path));
  const conflict = link.conflict ? conflictOf(facts.conflicts, link) : undefined;

  return {
    path: link.path,
    mode: link.mode,
    status: fileStatus({
      localOnly: link.localOnly,
      placement: link.status,
      conflict: link.conflict,
      heldBack: !!held,
      changed: !!changes?.differs,
      remote: !!repoId && facts.remote.has(repoId),
    }),
    ...(held ? { held: held.kind } : {}),
    ...(conflict ? { conflictId: conflict.id } : {}),
    ...(changes?.differs ? { keys: keyChanges(changes) } : {}),
  };
}

function conflictOf(conflicts: IConflictView[], link: TLink) {
  return conflicts.find((item) => item.path === link.path && item.roots.includes(link.root));
}

async function checkoutApprovals(adapters: TAdapters, state: ILocalState) {
  const approvals = new Map<string, TApproval>();

  for (const root of new Set(state.links.map((link) => link.root))) {
    const checkout = await adapters.repo.checkoutAt(root);
    const approval = checkout ? checkoutApproval(state, checkout) : "unavailable";

    approvals.set(root, approval === "ask" ? "needs-approval" : approval);
  }

  return approvals;
}
