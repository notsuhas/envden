import { shellFailure } from "./failures/operation.ts";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { IShellAdapter } from "@envden/core/adapters";

import type { TShell } from "./shell.ts";
import { editRc } from "./files/edit.ts";
import { start } from "./markers.ts";
import { renderHook } from "./render.ts";

async function read(path: string) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return "";
    throw error;
  }
}

class RcShellAdapter implements IShellAdapter {
  readonly id: TShell;

  private readonly home: string;
  private readonly envdenHome: string;
  private readonly backupDirectory: string | undefined;

  constructor(
    shell: TShell,
    home = homedir(),
    envdenHome = process.env.ENVDEN_HOME ?? join(home, ".envden"),
    backupDirectory?: string,
  ) {
    this.id = shell;
    this.home = home;
    this.envdenHome = envdenHome;
    this.backupDirectory = backupDirectory;
  }

  rcPath() {
    switch (this.id) {
      case "zsh":
        return join(this.home, ".zshrc");
      case "bash":
        return join(this.home, ".bashrc");
      case "fish":
        return join(this.home, ".config", "fish", "config.fish");
      case "powershell":
        return process.platform === "win32"
          ? join(this.home, "Documents", "PowerShell", "Microsoft.PowerShell_profile.ps1")
          : join(this.home, ".config", "powershell", "Microsoft.PowerShell_profile.ps1");
    }
  }

  hookSnippet(binaryPath: string) {
    return renderHook(this.id, binaryPath, this.envdenHome);
  }

  async installed() {
    return (await read(this.rcPath())).includes(start);
  }

  async install(binaryPath: string) {
    await editRc(
      this.rcPath(),
      (value) => {
        const current = strip(value);

        return `${current}${current && !current.endsWith("\n") ? "\n" : ""}${this.hookSnippet(binaryPath)}`;
      },
      this.backupDirectory,
    );
  }

  async uninstall() {
    await editRc(this.rcPath(), strip, this.backupDirectory);
  }
}

function strip(value: string) {
  return value.replace(/# >>> envden >>>\n[\s\S]*?# <<< envden <<<\n?/g, "");
}

export function createRcShellAdapter(
  shell: TShell,
  home?: string,
  envdenHome?: string,
  backupDirectory?: string,
): IShellAdapter {
  const adapter = new RcShellAdapter(shell, home, envdenHome, backupDirectory);

  return {
    id: adapter.id,
    rcPath: () => adapter.rcPath(),
    hookSnippet: (binaryPath) => adapter.hookSnippet(binaryPath),
    installed: () => adapter.installed().catch(shellFailure),
    install: (binaryPath) => adapter.install(binaryPath).catch(shellFailure),
    uninstall: () => adapter.uninstall().catch(shellFailure),
  };
}
