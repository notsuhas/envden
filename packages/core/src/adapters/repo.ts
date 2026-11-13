// Which repo a checkout belongs to (DESIGN § Store, checkouts and placement).
export interface ICheckout {
  root: string;
  repoId: string;
  upstreamRepoId?: string;
  gitDir: string;
  registeredWorktree?: boolean;
}

export interface IRepoAdapter {
  readonly id: string;
  checkoutAt(path: string): Promise<ICheckout | undefined>;
  worktrees(checkout: ICheckout): Promise<string[]>;
  envFiles(checkout: ICheckout): Promise<string[]>;
  isIgnored(checkout: ICheckout, relPath: string): Promise<boolean>;
  ensureIgnored(checkout: ICheckout, relPath: string): Promise<void>;
}
