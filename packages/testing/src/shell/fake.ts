import type { IShellAdapter } from "@envden/core/adapters";
import { unexpected } from "../fakes/operation.ts";

export function createFakeShellAdapter(
  operations: { [K in keyof IShellAdapter]?: IShellAdapter[K] | undefined } = {},
): IShellAdapter {
  return {
    id: operations.id ?? "fake-shell",
    rcPath: operations.rcPath?.bind(operations) ?? unexpected("shell.rcPath"),
    hookSnippet: operations.hookSnippet?.bind(operations) ?? unexpected("shell.hookSnippet"),
    installed: operations.installed?.bind(operations) ?? unexpected("shell.installed"),
    install: operations.install?.bind(operations) ?? unexpected("shell.install"),
    uninstall: operations.uninstall?.bind(operations) ?? unexpected("shell.uninstall"),
  };
}
