import { mostUrgent } from "./file-status.ts";
import type { IFileView, IRepoView, TApproval } from "./model.ts";

interface IFileRow {
  repoId: string;
  root: string;
  approval: TApproval;
  file: IFileView;
}

export function groupRepos(rows: IFileRow[]): IRepoView[] {
  const repos = new Map<string, IRepoView>();

  for (const row of rows) {
    const repo = repos.get(row.repoId) ?? {
      repoId: row.repoId,
      status: row.file.status,
      checkouts: [],
    };

    repos.set(row.repoId, repo);

    let checkout = repo.checkouts.find((item) => item.root === row.root);

    if (!checkout) {
      checkout = { root: row.root, approval: row.approval, files: [] };
      repo.checkouts.push(checkout);
    }

    checkout.files.push(row.file);
    repo.status = mostUrgent([repo.status, row.file.status]);
  }

  return [...repos.values()].sort((a, b) => a.repoId.localeCompare(b.repoId));
}
