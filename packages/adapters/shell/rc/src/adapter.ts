import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { IShellAdapter } from "@envden/core/adapters";

import type { TShell } from "./shell.ts";
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

  constructor(
    shell: TShell,
    home = homedir(),
    envdenHome = process.env.ENVDEN_HOME ?? join(home, ".envden"),
  ) {
    this.id = shell;
    this.home = home;
    this.envdenHome = envdenHome;
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
    const path = this.rcPath();
    const current = strip(await read(path));
    await mkdir(dirname(path), { recursive: true });

    await writeFile(
      path,
      `${current}${current && !current.endsWith("\n") ? "\n" : ""}${this.hookSnippet(binaryPath)}`,
      { mode: 0o600 },
    );
  }

  async uninstall() {
    const path = this.rcPath();
    const current = await read(path);
    if (current.includes(start)) await writeFile(path, strip(current));
  }
}

function strip(value: string) {
  return value.replace(/# >>> envden >>>\n[\s\S]*?# <<< envden <<<\n?/g, "");
}

export function createRcShellAdapter(
  shell: TShell,
  home?: string,
  envdenHome?: string,
): IShellAdapter {
  return new RcShellAdapter(shell, home, envdenHome);
}
