// The out-of-sync line in a shell rc file.
export interface IShellAdapter {
  readonly id: string;
  rcPath(): string;
  hookSnippet(binaryPath: string): string;
  installed(): Promise<boolean>;
  install(binaryPath: string): Promise<void>;
  uninstall(): Promise<void>;
}
