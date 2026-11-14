// Which repo a checkout belongs to (DESIGN § Store, checkouts and placement).
export interface ICheckout {
  root: string;
  repoId: string;
  upstreamRepoId?: string;
  gitDir: string;
  identity?: string;
  rootDevice?: number;
  registeredWorktree?: boolean;
}

export interface IEnvFileRules {
  include?: string[];
  exclude?: string[];
  extraSkipped?: string[];
}

export interface IRepoAdapter {
  readonly id: string;
  caseInsensitive(root: string, readOnly?: boolean): Promise<boolean>;
  checkoutAt(path: string): Promise<ICheckout | undefined>;
  worktrees(checkout: ICheckout): Promise<string[]>;
  envFiles(checkout: ICheckout, options?: IEnvFileRules): Promise<string[]>;
  isIgnored(checkout: ICheckout, relPath: string): Promise<boolean>;
  ensureIgnored(checkout: ICheckout, relPath: string): Promise<void>;
}
